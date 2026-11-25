import AppIntents
import Foundation

// HVAC Field：只放「可复算的单一换算式 / 单一尺寸式」，不做需要现场工况假设的估算。
// CFM ↔ 管径用 Q = A·V，吨位↔风量用北美住宅 400 CFM/ton 的经验值，dialog 里都写明来源。
@available(iOS 16.0, *)
struct FahrenheitToCelsiusIntent: AppIntent {
  static var title: LocalizedStringResource = "Convert °F to °C"
  static var description: IntentDescription? = IntentDescription(
    "Converts a Fahrenheit reading to Celsius while you're on a service call."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Fahrenheit")
  var fahrenheit: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Convert \(\.$fahrenheit) °F to °C")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let c = (fahrenheit - 32) * 5 / 9
    return .result(dialog: "\(String(format: "%.1f", fahrenheit)) °F is \(String(format: "%.1f", c)) °C.")
  }
}

@available(iOS 16.0, *)
struct CelsiusToFahrenheitIntent: AppIntent {
  static var title: LocalizedStringResource = "Convert °C to °F"
  static var description: IntentDescription? = IntentDescription(
    "Converts a Celsius reading to Fahrenheit while you're on a service call."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Celsius")
  var celsius: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Convert \(\.$celsius) °C to °F")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let f = celsius * 9 / 5 + 32
    return .result(dialog: "\(String(format: "%.1f", celsius)) °C is \(String(format: "%.1f", f)) °F.")
  }
}

@available(iOS 16.0, *)
struct DuctSizeIntent: AppIntent {
  static var title: LocalizedStringResource = "Round duct size from airflow"
  static var description: IntentDescription? = IntentDescription(
    "Sizes a round or square duct from airflow in CFM and target velocity in FPM, using Q = A × V."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Airflow", description: "Cubic feet per minute (CFM).")
  var cfm: Double

  @Parameter(title: "Velocity", description: "Target velocity in feet per minute (FPM), typically 600–900 for supply runs.", default: 700)
  var velocity: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Duct size for \(\.$cfm) CFM at \(\.$velocity) FPM")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard velocity > 0, cfm > 0 else {
      return .result(dialog: "Airflow and velocity both need to be greater than zero.")
    }
    let areaSqFt = cfm / velocity
    let diameterIn = (4 * areaSqFt / Double.pi).squareRoot() * 12
    let sideIn = areaSqFt.squareRoot() * 12
    let d = String(format: "%.1f", diameterIn)
    let s = String(format: "%.1f", sideIn)
    let a = String(format: "%.2f", areaSqFt)
    return .result(dialog: "\(String(format: "%.0f", cfm)) CFM at \(String(format: "%.0f", velocity)) FPM needs \(a) sq ft: a \(d) in round duct or a \(s) in square duct.")
  }
}

@available(iOS 16.0, *)
struct TonnageAirflowIntent: AppIntent {
  static var title: LocalizedStringResource = "Airflow for a tonnage"
  static var description: IntentDescription? = IntentDescription(
    "Gives nominal system airflow for a cooling tonnage using the North American sizing rule of thumb of 400 CFM per ton."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Tons", description: "Nominal cooling capacity in tons.", default: 3)
  var tons: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Airflow for \(\.$tons) tons")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard tons > 0 else { return .result(dialog: "Tonnage needs to be greater than zero.") }
    let cfm = tons * 400
    let low = tons * 350
    let high = tons * 450
    return .result(dialog: "\(String(format: "%.1f", tons)) tons is about \(String(format: "%.0f", cfm)) CFM nominal (400 CFM/ton rule of thumb); commissioned range is usually \(String(format: "%.0f", low))–\(String(format: "%.0f", high)) CFM.")
  }
}

@available(iOS 16.0, *)
struct OpenHVACIntent: AppIntent {
  static var title: LocalizedStringResource = "Open HVAC Field"
  static var description: IntentDescription? = IntentDescription(
    "Opens HVAC Field: refrigerant PT, superheat, electrical and gas tables."
  )
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

@available(iOS 16.0, *)
struct HVACShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: FahrenheitToCelsiusIntent(),
      phrases: [
        "Convert Fahrenheit in \(.applicationName)",
        "Fahrenheit to Celsius in \(.applicationName)",
      ],
      shortTitle: "°F to °C",
      systemImageName: "thermometer"
    )
    AppShortcut(
      intent: CelsiusToFahrenheitIntent(),
      phrases: ["Convert Celsius in \(.applicationName)"],
      shortTitle: "°C to °F",
      systemImageName: "thermometer.sun"
    )
    AppShortcut(
      intent: DuctSizeIntent(),
      phrases: [
        "Size a duct in \(.applicationName)",
        "What duct size in \(.applicationName)",
      ],
      shortTitle: "Duct size",
      systemImageName: "wind"
    )
    AppShortcut(
      intent: TonnageAirflowIntent(),
      phrases: ["Airflow for tonnage in \(.applicationName)"],
      shortTitle: "CFM per ton",
      systemImageName: "arrow.up.right"
    )
    AppShortcut(
      intent: OpenHVACIntent(),
      phrases: ["Open \(.applicationName)"],
      shortTitle: "Open HVAC Field",
      systemImageName: "wrench.and.screwdriver"
    )
  }
}


// MARK: - Refrigerant entity (Spotlight + Siri parameter)

// 意图层不读库：制冷剂常数是公开标准值，写死比查 app 状态可靠。Spotlight 里搜
// "R-454B" 能直接跳到这里，问 Siri 也能拿到 GWP 与充注量。
@available(iOS 16.0, *)
struct RefrigerantEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Refrigerant")
  static var defaultQuery = RefrigerantQuery()

  let id: String
  let summary: String
  /// 100-year GWP (AR4/AR5 figure quoted on refrigerant cylinders).
  let gwp: Int
  /// ASHRAE 34 safety classification.
  let safetyClass: String
  /// Nominal pounds of charge per ton of cooling.
  let poundsPerTon: Double

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(summary)", subtitle: "GWP \(gwp) · \(safetyClass)")
  }

  static let all: [RefrigerantEntity] = [
    RefrigerantEntity(id: "r-410a", summary: "R-410A", gwp: 2088, safetyClass: "A1", poundsPerTon: 2.5),
    RefrigerantEntity(id: "r-32", summary: "R-32", gwp: 675, safetyClass: "A2L", poundsPerTon: 2.0),
    RefrigerantEntity(id: "r-454b", summary: "R-454B", gwp: 466, safetyClass: "A2L", poundsPerTon: 2.1),
    RefrigerantEntity(id: "r-22", summary: "R-22", gwp: 1810, safetyClass: "A1", poundsPerTon: 2.9),
  ]
}

@available(iOS 18.0, *)
extension RefrigerantEntity: IndexedEntity {}

@available(iOS 16.0, *)
struct RefrigerantQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [RefrigerantEntity] {
    RefrigerantEntity.all.filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [RefrigerantEntity] {
    RefrigerantEntity.all
  }

  func defaultResult() async -> RefrigerantEntity? {
    RefrigerantEntity.all.first
  }
}

@available(iOS 16.0, *)
struct RefrigerantChargeIntent: AppIntent {
  static var title: LocalizedStringResource = "Refrigerant charge per ton"
  static var description = IntentDescription("Pounds of charge per ton of cooling, with GWP and ASHRAE safety class.")

  @Parameter(title: "Refrigerant")
  var refrigerant: RefrigerantEntity

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let pounds = refrigerant.poundsPerTon
    let text = "\(refrigerant.summary): about \(String(format: "%.1f", pounds)) lb per ton of cooling. GWP \(refrigerant.gwp), safety class \(refrigerant.safetyClass)."
    return .result(dialog: IntentDialog(stringLiteral: text))
  }
}
