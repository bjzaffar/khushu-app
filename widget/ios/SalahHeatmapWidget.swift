import SwiftUI
import WidgetKit

struct SalahHeatmapProvider: TimelineProvider {
    func placeholder(in context: Context) -> SalahHeatmapEntry {
        emptyEntry()
    }

    func getSnapshot(in context: Context, completion: @escaping (SalahHeatmapEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SalahHeatmapEntry>) -> Void) {
        let calendar = Calendar.current
        let now = Date()
        let nextMonday: Date
        if let next = calendar.nextDate(
            after: now,
            matching: DateComponents(weekday: 2),
            matchingPolicy: .nextTime
        ) {
            nextMonday = calendar.startOfDay(for: next)
        } else {
            nextMonday = calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: now))!
        }

        completion(Timeline(entries: [loadEntry()], policy: .after(nextMonday)))
    }

    private func emptyEntry() -> SalahHeatmapEntry {
        SalahHeatmapEntry(
            date: Date(),
            cells: (0..<35).map { _ in HeatmapCell(day: "", salah: "", rating: nil) },
            weekStart: "",
            weekEnd: "",
            isPremium: false
        )
    }

    private func loadEntry() -> SalahHeatmapEntry {
        let defaults = UserDefaults(suiteName: "group.com.khushuai.app")
        guard let data = defaults?.data(forKey: "widget_heatmap_data"),
              let decoded = try? JSONDecoder().decode(HeatmapData.self, from: data) else {
            return emptyEntry()
        }

        return SalahHeatmapEntry(
            date: Date(),
            cells: decoded.cells,
            weekStart: decoded.weekStart,
            weekEnd: decoded.weekEnd,
            isPremium: decoded.isPremium ?? false
        )
    }
}

struct SalahHeatmapWidget: Widget {
    let kind = "SalahHeatmapWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SalahHeatmapProvider()) { entry in
            SalahHeatmapWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Prayer Heatmap")
        .description("Weekly prayer focus heatmap")
        .supportedFamilies([.systemMedium])
    }
}

struct SalahHeatmapWidgetEntryView: View {
    let entry: SalahHeatmapEntry

    var body: some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(.fill, for: .widget)
        } else {
            content.background(Color.white)
        }
    }

    private var content: some View {
        ZStack {
            Color.white
            if entry.isPremium {
                Link(destination: URL(string: "khushuai://")!) {
                    SalahHeatmapView(cells: entry.cells)
                        .padding(8)
                }
            } else {
                Link(destination: URL(string: "khushuai://paywall")!) {
                    VStack(spacing: 8) {
                        Text("Prayer Heatmap")
                            .font(.headline)
                            .foregroundStyle(Color(red: 0.102, green: 0.098, blue: 0.090))
                        Text("Premium feature\nTap to unlock")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Color(red: 0.443, green: 0.420, blue: 0.420))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
    }
}

@main
struct SalahHeatmapWidgetBundle: WidgetBundle {
    var body: some Widget {
        SalahHeatmapWidget()
    }
}
