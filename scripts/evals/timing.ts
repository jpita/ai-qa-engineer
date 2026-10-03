export interface TimedTrial {
  passed: boolean;
  agentElapsedSeconds: number;
}

export function summarizeTiming(rows: TimedTrial[], wallSeconds: number) {
  const round = (n: number) => Number(n.toFixed(2));
  const durations = rows.map(row => row.agentElapsedSeconds).sort((a, b) => a - b);
  const average = (selected: TimedTrial[]) => selected.length
    ? round(selected.reduce((sum, row) => sum + row.agentElapsedSeconds, 0) / selected.length) : null;
  const middle = Math.floor(durations.length / 2);
  return {
    wallSeconds: round(wallSeconds),
    totalAgentSeconds: round(durations.reduce((sum, n) => sum + n, 0)),
    averageAgentSeconds: average(rows),
    medianAgentSeconds: durations.length ? round(durations.length % 2
      ? durations[middle]! : (durations[middle - 1]! + durations[middle]!) / 2) : null,
    averagePassedAgentSeconds: average(rows.filter(row => row.passed)),
    averageFailedAgentSeconds: average(rows.filter(row => !row.passed)),
  };
}
