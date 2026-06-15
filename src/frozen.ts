class FrozenIndex {
  private documentMapping: Array<number> = [];
  constructor() {
    this.documentMapping = [];
  }

  mapDocumentIdsToIds(ids: Array<number>) {
    ids.forEach((id, i) => (this.documentMapping[i] = id));

    this.documentMapping.forEach((element) => console.log(element));
  }
}

// quick toy test — run: npx tsx src/frozen.ts
const f = new FrozenIndex();
f.mapDocumentIdsToIds([36111, 36222, 36333]);
