import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as H from './src/hvac';
import FeedbackModal from './src/FeedbackModal';
import { GROUPS, TOOLS, encodeValue, parseFieldValue, toolById, type Field, type Tool, type Units } from './src/tools';
import { useDuo } from './src/duo';

type Screen = { kind: 'list' } | { kind: 'tool'; id: string } | { kind: 'job' } | { kind: 'about' };

type JobLine = { id: string; label: string; note: string; qty: number; unit: string };
type StoredJob = { lines: JobLine[] };

const JOB_FILE = (() => {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}hvacfield-job.json` : null;
})();

export default function App() {
  const duo = useDuo();
  return (
    <View style={{ flex: 1, backgroundColor: '#F2F5F4', paddingRight: duo.gutter }}>
      <AppScreens />
    </View>
  );
}

function AppScreens() {
  const [units, setUnits] = useState<Units>('imperial');
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [choices, setChoices] = useState<Record<string, Record<string, string>>>({});
  const [job, setJob] = useState<JobLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!JOB_FILE) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(JOB_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(JOB_FILE);
          const parsed = JSON.parse(raw) as StoredJob;
          if (Array.isArray(parsed.lines)) setJob(parsed.lines);
        }
      } catch {
        // 文件损坏就当空表，不阻塞启动
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!JOB_FILE || !loaded) return;
    const payload: StoredJob = { lines: job };
    FileSystem.writeAsStringAsync(JOB_FILE, JSON.stringify(payload)).catch(() => {});
  }, [job, loaded]);

  const textFor = useCallback(
    (t: Tool, f: Field): string => {
      const stored = values[t.id]?.[f.key];
      if (stored != null) return stored;
      return encodeValue(f, f.def, units);
    },
    [values, units]
  );

  const setFieldText = useCallback((toolId: string, key: string, text: string) => {
    setValues((prev) => ({ ...prev, [toolId]: { ...(prev[toolId] ?? {}), [key]: text } }));
  }, []);

  const resetTool = useCallback((toolId: string) => {
    setValues((prev) => {
      const next = { ...prev };
      delete next[toolId];
      return next;
    });
  }, []);

  const toggleUnits = useCallback(
    (next: Units) => {
      if (next === units) return;
      setValues((prev) => {
        const out: Record<string, Record<string, string>> = {};
        for (const t of TOOLS) {
          const row = prev[t.id];
          if (!row) continue;
          const converted: Record<string, string> = {};
          for (const f of t.fields) {
            const text = row[f.key];
            if (text == null) continue;
            const canonical = parseFieldValue(f, text, units);
            converted[f.key] = encodeValue(f, canonical, next);
          }
          out[t.id] = converted;
        }
        return out;
      });
      setUnits(next);
    },
    [units]
  );

  const addToJob = useCallback((tool: Tool, items: { label: string; qty: number; unit: string }[]) => {
    setJob((prev) => {
      let next = prev;
      for (const item of items) {
        if (!(item.qty > 0)) continue;
        const line: JobLine = {
          id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          label: item.label,
          note: tool.name,
          qty: Math.round(item.qty * 100) / 100,
          unit: item.unit,
        };
        next = [...next, line];
      }
      return next;
    });
    setScreen({ kind: 'job' });
  }, []);

  const removeLine = useCallback((id: string) => {
    setJob((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const shareJob = useCallback(async () => {
    if (job.length === 0) return;
    const body = job.map((l) => `• ${l.label}: ${l.qty} ${l.unit}`).join('\n');
    try {
      await Share.share({
        message: `HVAC FieldCalc job sheet\n${body}\n\n${H.DISCLAIMER}`,
      });
    } catch {
      // 用户取消分享
    }
  }, [job]);

  if (screen.kind === 'about') {
    return <AboutScreen onBack={() => setScreen({ kind: 'list' })} />;
  }

  if (screen.kind === 'tool') {
    const tool = toolById(screen.id);
    if (!tool) {
      return (
        <ListScreen
          tools={TOOLS}
          units={units}
          onToggleUnits={toggleUnits}
          onOpen={(id) => setScreen({ kind: 'tool', id })}
          job={job}
          onJob={() => setScreen({ kind: 'job' })}
          onAbout={() => setScreen({ kind: 'about' })}
        />
      );
    }
    return (
      <ToolScreen
        tool={tool}
        units={units}
        textFor={textFor}
        onChange={setFieldText}
        choiceFor={(key) => choices[tool.id]?.[key] ?? tool.choices?.find((c) => c.key === key)?.def ?? ''}
        onChoice={(key, value) => setChoices((prev) => ({ ...prev, [tool.id]: { ...(prev[tool.id] ?? {}), [key]: value } }))}
        onReset={() => resetTool(tool.id)}
        onBack={() => setScreen({ kind: 'list' })}
        onAdd={(items) => addToJob(tool, items)}
      />
    );
  }

  if (screen.kind === 'job') {
    return (
      <JobScreen
        job={job}
        onRemove={removeLine}
        onClear={() => setJob([])}
        onShare={shareJob}
        onBack={() => setScreen({ kind: 'list' })}
      />
    );
  }

  return (
    <ListScreen
      tools={TOOLS}
      units={units}
      onToggleUnits={toggleUnits}
      onOpen={(id) => setScreen({ kind: 'tool', id })}
      job={job}
      onJob={() => setScreen({ kind: 'job' })}
      onAbout={() => setScreen({ kind: 'about' })}
    />
  );
}

// ——————————————————— 首页 ———————————————————

function ListScreen(props: {
  tools: Tool[];
  units: Units;
  onToggleUnits: (u: Units) => void;
  onOpen: (id: string) => void;
  job: JobLine[];
  onJob: () => void;
  onAbout: () => void;
}) {
  const { tools, units, onToggleUnits, onOpen, job, onJob, onAbout } = props;
  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>HVAC FieldCalc</Text>
            <Text style={S.subtitle}>Duct · air · charge · electrical · gas</Text>
          </View>
          <UnitSwitch units={units} onChange={onToggleUnits} />
        </View>
      </View>
      <ScrollView contentContainerStyle={S.listBody}>
        {GROUPS.map((group) => {
          const items = tools.filter((t) => t.group === group);
          if (items.length === 0) return null;
          return (
            <View key={group} style={S.groupBlock}>
              <Text style={S.groupTitle}>{group.toUpperCase()}</Text>
              {items.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => onOpen(t.id)}
                  style={({ pressed }) => [S.toolRow, pressed && S.pressed]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={S.toolName}>{t.name}</Text>
                    <Text style={S.toolBlurb}>{t.blurb}</Text>
                  </View>
                  <Text style={S.chev}>›</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
        <Pressable onPress={onAbout} style={({ pressed }) => [S.aboutRow, pressed && S.pressed]}>
          <Text style={S.aboutTitle}>Data sources & assumptions</Text>
          <Text style={S.aboutSub}>NEC 2023 · NFPA 54 · ASHRAE friction basis · CoolProp</Text>
        </Pressable>
        <Text style={S.footerNote}>{H.DISCLAIMER}</Text>
      </ScrollView>
      <JobBar job={job} onPress={onJob} />
    </View>
  );
}

function UnitSwitch(props: { units: Units; onChange: (u: Units) => void }) {
  const { units, onChange } = props;
  return (
    <View style={S.switch}>
      {(['imperial', 'metric'] as Units[]).map((u) => {
        const active = units === u;
        return (
          <Pressable key={u} onPress={() => onChange(u)} style={[S.switchBtn, active && S.switchBtnActive]}>
            <Text style={[S.switchText, active && S.switchTextActive]}>{u === 'imperial' ? 'US' : 'Metric'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function JobBar(props: { job: JobLine[]; onPress: () => void }) {
  const { job, onPress } = props;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [S.jobBar, pressed && S.pressed]}>
      <View style={{ flex: 1 }}>
        <Text style={S.jobBarTitle}>Job sheet</Text>
        <Text style={S.jobBarSub}>
          {job.length === 0 ? 'No items yet' : `${job.length} item${job.length === 1 ? '' : 's'}`}
        </Text>
      </View>
      <Text style={S.jobBarChev}>›</Text>
    </Pressable>
  );
}

// ——————————————————— 单工具页 ———————————————————

function ToolScreen(props: {
  tool: Tool;
  units: Units;
  textFor: (t: Tool, f: Field) => string;
  onChange: (toolId: string, key: string, text: string) => void;
  choiceFor: (key: string) => string;
  onChoice: (key: string, value: string) => void;
  onReset: () => void;
  onBack: () => void;
  onAdd: (items: { label: string; qty: number; unit: string }[]) => void;
}) {
  const { tool, units, textFor, onChange, choiceFor, onChoice, onReset, onBack, onAdd } = props;

  const numbers = useMemo(() => {
    const n: Record<string, number> = {};
    for (const f of tool.fields) {
      n[f.key] = parseFieldValue(f, textFor(tool, f), units);
    }
    return n;
  }, [tool, textFor, units]);

  const sections = useMemo(() => {
    const s: Record<string, string> = {};
    for (const c of tool.choices ?? []) s[c.key] = choiceFor(c.key);
    return s;
  }, [tool, choiceFor]);

  const out = useMemo(() => {
    try {
      return tool.calc(numbers, sections, units);
    } catch {
      return { primary: '—', primaryUnit: '', rows: [], note: 'Check your inputs', job: [] };
    }
  }, [tool, numbers, sections, units]);

  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <Pressable onPress={onBack} style={S.backBtn} hitSlop={12}>
          <Text style={S.backText}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.toolTitle}>{tool.name}</Text>
          <Text style={S.toolBlurb}>{tool.blurb}</Text>
        </View>
        <Pressable onPress={onReset} hitSlop={10}>
          <Text style={S.reset}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={S.body} keyboardShouldPersistTaps="handled">
        {tool.fields.map((f) => (
          <View key={f.key} style={S.fieldRow}>
            <Text style={S.fieldLabel}>{f.label}</Text>
            <View style={S.inputWrap}>
              <TextInput
                value={textFor(tool, f)}
                onChangeText={(t) => onChange(tool.id, f.key, t)}
                style={S.input}
                keyboardType={f.kind === 'length' && units === 'imperial' ? 'numbers-and-punctuation' : 'decimal-pad'}
                placeholder={f.kind === 'length' ? (units === 'imperial' ? `10' 6"` : '3.05') : '0'}
                placeholderTextColor="#9AA7AE"
                selectTextOnFocus
                returnKeyType="done"
              />
              <Text style={S.inputUnit}>{fieldUnit(f, units)}</Text>
            </View>
          </View>
        ))}

        {(tool.choices ?? []).map((c) => (
          <View key={c.key} style={S.choiceBlock}>
            <Text style={S.fieldLabel}>{c.label}</Text>
            <View style={S.chips}>
              {c.options.map((o) => {
                const active = sections[c.key] === o.value;
                return (
                  <Pressable key={o.value} onPress={() => onChoice(c.key, o.value)} style={[S.chip, active && S.chipActive]}>
                    <Text style={[S.chipText, active && S.chipTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <View style={S.resultCard}>
          <Text style={S.resultLabel}>Result</Text>
          <View style={S.resultRow}>
            <Text style={S.resultValue}>{out.primary}</Text>
            {out.primaryUnit ? <Text style={S.resultUnit}>{out.primaryUnit}</Text> : null}
          </View>
        </View>

        {out.rows.length > 0 && (
          <View style={S.rowsCard}>
            {out.rows.map((r, i) => (
              <View key={`${r.label}-${i}`} style={S.rowLine}>
                <Text style={S.rowLabel}>{r.label}</Text>
                <Text style={S.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={S.note}>{out.note}</Text>

        {out.job.length > 0 && (
          <Pressable onPress={() => onAdd(out.job)} style={({ pressed }) => [S.addBtn, pressed && S.pressed]}>
            <Text style={S.addBtnText}>Add to job sheet</Text>
          </Pressable>
        )}

        <Text style={S.disclaimer}>{H.DISCLAIMER}</Text>
      </ScrollView>
    </View>
  );
}

// ——————————————————— 作业单 ———————————————————

function JobScreen(props: {
  job: JobLine[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onShare: () => void;
  onBack: () => void;
}) {
  const { job, onRemove, onClear, onShare, onBack } = props;
  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <Pressable onPress={onBack} style={S.backBtn} hitSlop={12}>
          <Text style={S.backText}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.toolTitle}>Job sheet</Text>
          <Text style={S.toolBlurb}>
            {job.length} item{job.length === 1 ? '' : 's'} · saved on this phone
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.body} keyboardShouldPersistTaps="handled">
        {job.length === 0 ? (
          <View style={S.emptyJob}>
            <Text style={S.emptyTitle}>Nothing here yet</Text>
            <Text style={S.emptySub}>Run a calculator and tap “Add to job sheet”.</Text>
          </View>
        ) : (
          job.map((l) => (
            <View key={l.id} style={S.jobRow}>
              <View style={{ flex: 1 }}>
                <Text style={S.jobLabel}>{l.label}</Text>
                <Text style={S.jobMeta}>
                  {l.note} · {l.qty} {l.unit}
                </Text>
              </View>
              <Pressable onPress={() => onRemove(l.id)} hitSlop={10} style={S.removeBtn}>
                <Text style={S.removeText}>×</Text>
              </Pressable>
            </View>
          ))
        )}

        {job.length > 0 && (
          <View style={S.jobActions}>
            <Pressable onPress={onShare} style={({ pressed }) => [S.addBtn, pressed && S.pressed]}>
              <Text style={S.addBtnText}>Share job sheet</Text>
            </Pressable>
            <Pressable onPress={onClear} style={({ pressed }) => [S.ghostBtn, pressed && S.pressed]}>
              <Text style={S.ghostBtnText}>Clear all</Text>
            </Pressable>
          </View>
        )}

        <Text style={S.disclaimer}>{H.DISCLAIMER}</Text>
      </ScrollView>
    </View>
  );
}

// ——————————————————— 数据来源页 —————————————————

function AboutScreen(props: { onBack: () => void }) {
  const entries = Object.entries(H.DATA_SOURCES);
  const [fbOpen, setFbOpen] = useState(false);
  return (
    <View style={S.root}>
      <StatusBar style="dark" />
      <View style={S.header}>
        <Pressable onPress={props.onBack} style={S.backBtn} hitSlop={12}>
          <Text style={S.backText}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.toolTitle}>Data sources</Text>
          <Text style={S.toolBlurb}>Build {H.DATA_VERSION} · nothing leaves the phone</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={S.body}>
        {entries.map(([key, text]) => (
          <View key={key} style={S.sourceRow}>
            <Text style={S.sourceText}>{text}</Text>
          </View>
        ))}
        <View style={S.sourceRow}>
          <Text style={S.sourceText}>
            Assumptions: {H.ASSUMPTIONS.natGasBtuPerCuFt} Btu/ft³ natural gas, {H.ASSUMPTIONS.lpGasBtuPerCuFt} Btu/ft³
            propane, {H.ASSUMPTIONS.sensibleFactor} sensible / {H.ASSUMPTIONS.latentFactor} latent /{' '}
            {H.ASSUMPTIONS.totalFactor} total air constants, {H.CONV.kPaPerPsig} kPa per psig.
          </Text>
        </View>
        <View style={S.sourceRow}>
          <Text style={S.sourceText}>
            Refrigerant tables are bubble-point values in 2 psig steps. R-407C and other zeotropic blends have a
            measurable glide — the dew-point temperature can differ several degrees from what this chart shows.
          </Text>
        </View>
        <Text style={S.disclaimer}>{H.DISCLAIMER}</Text>
        <Pressable onPress={() => setFbOpen(true)} style={{ paddingVertical: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#8A4B12' }}>Send feedback</Text>
        </Pressable>
      </ScrollView>
      <FeedbackModal visible={fbOpen} onClose={() => setFbOpen(false)} context="about" />
    </View>
  );
}

// ——————————————————— 样式 ———————————————————

const fieldUnit = (f: Field, u: Units): string => {
  switch (f.kind) {
    case 'length':
      return u === 'imperial' ? 'ft-in' : 'm';
    case 'inch':
      return u === 'imperial' ? 'in' : 'mm';
    case 'area':
      return u === 'imperial' ? 'sq ft' : 'm²';
    case 'temp':
      return u === 'imperial' ? '°F' : '°C';
    case 'pressure':
      return u === 'imperial' ? 'psig' : 'kPa';
    case 'cfm':
      return u === 'imperial' ? 'cfm' : 'm³/h';
    case 'percent':
      return '%';
    case 'count':
      return 'ea';
    default:
      return f.unitHint ?? '';
  }
};

const INK = '#10232E';
const SUB = '#586B75';
const LINE = '#DDE5E4';
const ACCENT = '#1B6E8C';

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F4' },
  header: {
    paddingTop: 58,
    paddingBottom: 12,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LINE,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', flex: 1 },
  title: { fontSize: 25, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  subtitle: { fontSize: 12, color: SUB, marginTop: 2 },
  toolTitle: { fontSize: 18, fontWeight: '700', color: INK },
  toolBlurb: { fontSize: 12, color: SUB, marginTop: 2 },
  switch: { flexDirection: 'row', backgroundColor: '#EAF0EF', borderRadius: 9, padding: 2 },
  switchBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  switchBtnActive: { backgroundColor: INK },
  switchText: { fontSize: 12, fontWeight: '600', color: SUB },
  switchTextActive: { color: '#FFFFFF' },
  listBody: { padding: 16, paddingBottom: 28 },
  groupBlock: { marginBottom: 18 },
  groupTitle: { fontSize: 11, fontWeight: '700', color: SUB, letterSpacing: 1.2, marginBottom: 8, marginLeft: 4 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  pressed: { opacity: 0.7 },
  toolName: { fontSize: 15, fontWeight: '600', color: INK },
  chev: { fontSize: 20, color: '#B3BFC3', marginLeft: 8 },
  footerNote: { fontSize: 11, color: '#8A979D', lineHeight: 16, marginTop: 8 },
  aboutRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  aboutTitle: { fontSize: 14, fontWeight: '700', color: INK },
  aboutSub: { fontSize: 11, color: SUB, marginTop: 3 },
  jobBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INK,
    marginHorizontal: 16,
    marginBottom: 26,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  jobBarTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  jobBarSub: { color: '#9FB0B8', fontSize: 12, marginTop: 2 },
  jobBarChev: { color: '#FFFFFF', fontSize: 20 },
  backBtn: { paddingRight: 12, paddingBottom: 2 },
  backText: { fontSize: 15, color: ACCENT, fontWeight: '600' },
  reset: { fontSize: 13, color: SUB, marginBottom: 2 },
  body: { padding: 16, paddingBottom: 40 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  fieldLabel: { flex: 1, fontSize: 14, color: INK },
  inputWrap: { flexDirection: 'row', alignItems: 'center', minWidth: 118, justifyContent: 'flex-end' },
  input: {
    minWidth: 82,
    textAlign: 'right',
    fontSize: 15,
    color: INK,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  inputUnit: { fontSize: 11, color: '#8A979D', marginLeft: 4, width: 38, textAlign: 'right' },
  choiceBlock: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    marginRight: 8,
    marginTop: 4,
  },
  chipActive: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, color: INK, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  resultCard: { backgroundColor: INK, borderRadius: 14, padding: 18, marginTop: 14 },
  resultLabel: { color: '#9FB0B8', fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  resultRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  resultValue: { color: '#FFFFFF', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  resultUnit: { color: '#D6E0E3', fontSize: 15, marginLeft: 8, marginBottom: 8 },
  rowsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  rowLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF2F0',
  },
  rowLabel: { fontSize: 14, color: SUB },
  rowValue: { fontSize: 14, color: INK, fontWeight: '600' },
  note: { fontSize: 11, color: '#8A979D', lineHeight: 16, marginTop: 10 },
  addBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ghostBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  ghostBtnText: { color: SUB, fontSize: 14, fontWeight: '600' },
  disclaimer: { fontSize: 11, color: '#8A979D', lineHeight: 16, marginTop: 18 },
  emptyJob: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK },
  emptySub: { fontSize: 13, color: SUB, marginTop: 6, textAlign: 'center' },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  jobLabel: { fontSize: 15, fontWeight: '600', color: INK },
  jobMeta: { fontSize: 11, color: SUB, marginTop: 2 },
  removeBtn: { paddingLeft: 10 },
  removeText: { fontSize: 18, color: '#B3BFC3' },
  jobActions: { marginTop: 6 },
  sourceRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
  },
  sourceText: { fontSize: 12, color: SUB, lineHeight: 18 },
});
