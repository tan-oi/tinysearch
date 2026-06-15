// top-k via a size-k min-heap: keep only the best k as a stream of scores flies by.
// heap stores [score, id] pairs; heap[0] is the smallest kept score (the "doorman").
export function getTopK(scores: Map<number, number>, k: number = 10) {
  const heap: [number, number][] = [];

  scores.forEach((score, id) => {
    if (heap.length < k) {
      heap.push([score, id]);
      siftUp(heap, heap.length - 1);
    } else if (score > heap[0]![0]) {
      heap[0] = [score, id];
      siftDown(heap, 0);
    }
  });

  return heap.sort((a, b) => b[0] - a[0]);
}

function siftUp(heap: [number, number][], i: number) {
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (heap[i]![0] < heap[parent]![0]) {
      // smaller than parent → swap up, keep climbing
      [heap[i], heap[parent]] = [heap[parent]!, heap[i]!];
      i = parent;
    } else {
      break;
    }
  }
}

function siftDown(heap: [number, number][], i: number) {
  const n = heap.length;
  while (true) {
    let smallest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < n && heap[left]![0] < heap[smallest]![0]) smallest = left;
    if (right < n && heap[right]![0] < heap[smallest]![0]) smallest = right;
    if (smallest === i) break;
    [heap[i], heap[smallest]] = [heap[smallest]!, heap[i]!];
    i = smallest;
  }
}
