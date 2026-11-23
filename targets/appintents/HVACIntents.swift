import AppIntents
import Foundation

// HVACCxCalc：只放「可复算的单一换算式」，不做需要工况假设的估算。
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
      intent: OpenHVACIntent(),
      phrases: ["Open \(.applicationName)"],
      shortTitle: "Open HVAC Field",
      systemImageName: "wind"
    )
  }
}


