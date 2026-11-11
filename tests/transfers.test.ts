import { describe, expect, it } from "vitest";
import {
  durationMinutes,
  formatDuration,
  formatLocal,
  localToUtcIso,
  utcToLocalInput,
} from "../src/lib/transfers";

describe("Zeitzonen-Umrechnung", () => {
  it("Vancouver im Sommer (PDT, UTC−7)", () => {
    expect(localToUtcIso("2027-07-01T10:30", "America/Vancouver")).toBe("2027-07-01T17:30:00.000Z");
  });

  it("Calgary im Sommer (MDT, UTC−6)", () => {
    expect(localToUtcIso("2027-07-01T10:30", "America/Edmonton")).toBe("2027-07-01T16:30:00.000Z");
  });

  it("Zürich im Winter (MEZ, UTC+1)", () => {
    expect(localToUtcIso("2027-01-15T08:00", "Europe/Zurich")).toBe("2027-01-15T07:00:00.000Z");
  });

  it("Hin- und Rückweg ergibt dieselbe Uhrzeit", () => {
    const iso = localToUtcIso("2027-07-01T10:30", "America/Vancouver");
    expect(utcToLocalInput(iso, "America/Vancouver")).toBe("2027-07-01T10:30");
    expect(formatLocal(iso, "America/Vancouver")).toBe("01.07.2027 10:30");
  });

  it("Flug Zürich → Vancouver: Dauer aus Ortszeiten", () => {
    const depart = localToUtcIso("2027-07-01T10:30", "Europe/Zurich"); // 08:30Z
    const arrive = localToUtcIso("2027-07-01T12:00", "America/Vancouver"); // 19:00Z
    expect(durationMinutes({ depart_at: depart, arrive_at: arrive, duration_min: null })).toBe(630);
    expect(formatDuration(630)).toBe("10 h 30 min");
  });

  it("nimmt ohne beide Zeiten die manuelle Dauer", () => {
    expect(durationMinutes({ depart_at: null, arrive_at: null, duration_min: 90 })).toBe(90);
  });

  it("lehnt ungültige Eingaben ab", () => {
    expect(() => localToUtcIso("kaputt", "Europe/Zurich")).toThrow();
  });
});
