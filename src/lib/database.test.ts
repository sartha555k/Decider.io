import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertEntity, listEntities, openDatabase, transaction } from "./database";
import { messages, scope, seedPrimaryScenario } from "./fixtures";

describe("persistent practice workspace", () => {
  it("persists across restarts without duplicating the seed", () => {
    const dir = mkdtempSync(join(tmpdir(),"tracker-"));
    const path = join(dir,"test.sqlite");
    try {
      const first = openDatabase(path);
      expect(seedPrimaryScenario(first)).toBe(true); first.close();
      const second = openDatabase(path);
      try {
        expect(seedPrimaryScenario(second)).toBe(false);
        const queue = listEntities(second,"outreach",scope.sellerId,scope.companyId);
        expect(queue).toHaveLength(3);
        expect(queue.find(item => item.id === "outreach-general")?.factIds).toEqual([]);
        expect(queue.find(item => item.id === "outreach-sent")?.status).toBe("sent");
        expect(listEntities(second,"facts",scope.sellerId,scope.companyId)[0].value).toBe("Salesforce");
      } finally { second.close(); }
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  it("confines reads to the requested seller and company", () => {
    const db = openDatabase(":memory:");
    try {
      seedPrimaryScenario(db);
      expect(listEntities(db,"outreach","other-seller",scope.companyId)).toEqual([]);
      expect(listEntities(db,"outreach",scope.sellerId,"other-company")).toEqual([]);
    } finally { db.close(); }
  });
  it("rejects duplicate ingestion and rolls back partial writes", () => {
    const db = openDatabase(":memory:");
    try {
      seedPrimaryScenario(db);
      expect(() => transaction(db,() => {
        insertEntity(db,"messages",{...messages[1],id:"new",ingestionId:"new-ingestion"});
        insertEntity(db,"messages",{...messages[1],id:"duplicate"});
      })).toThrow();
      expect(listEntities(db,"messages",scope.sellerId,scope.companyId)).toHaveLength(2);
    } finally { db.close(); }
  });
});
