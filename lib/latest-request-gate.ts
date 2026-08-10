export type LatestRequest = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

export type LatestRequestGate = {
  begin: () => LatestRequest;
  cancel: () => void;
};

export function createLatestRequestGate(): LatestRequestGate {
  let sequence = 0;
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      const controller = new AbortController();
      const requestSequence = ++sequence;
      activeController = controller;
      return {
        signal: controller.signal,
        isCurrent: () => requestSequence === sequence,
      };
    },
    cancel() {
      sequence += 1;
      activeController?.abort();
      activeController = null;
    },
  };
}
