/** Monday 9 AM New York in unix seconds, never in the future (including DST). */
export function mondayNineNY(nowSec = Math.floor(Date.now() / 1000)): number {
  const tz = "America/New_York";
  const parts = (ms: number) => Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(ms).map((p) => [p.type, p.value]),
  );
  const p = parts(nowSec * 1000);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day - dow, 9, 0, 0);
  const inNewYork = (localGuess: number) => {
    let t = localGuess;
    for (let i = 0; i < 3; i++) {
      const q = parts(t);
      t = localGuess - (Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second) - t);
    }
    return Math.floor(t / 1000);
  };
  const sec = inNewYork(guess);
  return sec <= nowSec ? sec : inNewYork(guess - 7 * 86400_000);
}
