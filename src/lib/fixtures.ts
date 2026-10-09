import type { DatabaseSync } from "node:sqlite";
import { insertEntity, transaction, type Entity } from "./database";
export const referenceDate = "2026-10-10T09:00:00+05:30";
export const referenceTimezone = "Asia/Calcutta";
export const scope = { sellerId: "seller-routewise", companyId: "company-northstar" };
export const seller = { id: scope.sellerId, name: "Routewise", productDescription: "Software that checks CRM lead-routing rules.", problems: ["Broken lead-routing rules", "Leads assigned to the wrong owner"], integrations: ["Salesforce", "HubSpot"], limitations: ["Local demonstration only"], targetCriteria: ["Sales teams with a supported CRM"], preferences: { approvalRequired: true, automation: false } };
export const company = { ...scope, id: scope.companyId, name: "Northstar Labs", domain: "northstar.example", suppressed: false };
export const contact = { ...scope, id: "contact-maya", name: "Maya Chen", role: "Revenue Operations Lead", suppressed: false };
export const evidence: Entity = { ...scope, id: "evidence-job", sourceType: "webpage", sourceUrl: "https://northstar.example/jobs/revenue-operations", originalText: "We are seeking a Revenue Operations specialist with Salesforce experience.", imageReference: null, publishedAt: "2026-02-12", eventDate: null, checkedAt: "2026-06-15", speaker: "Northstar Labs fictional job posting", scope: "company", provenance: "Fictional dated job posting; an inference, not verified current usage." };
export const fact: Entity = { ...scope, id: "fact-crm", contactId: null, category: "technology", field: "CRM", value: "Salesforce", scope: "company", evidenceId: evidence.id, status: "active", recordedAt: "2026-06-15T09:00:00Z", checkedAt: "2026-06-15", version: 1 };
export const reply = "We switched to HubSpot last month. We don’t use Salesforce anymore.";
const base = { ...scope, contactId: contact.id, conversationId: "conversation-primary" };
export const messages: Entity[] = [
  { ...base, id: "message-sent", direction: "outbound", body: "Hi Maya, we help teams check their Salesforce lead-routing rules. Would an overview be useful?", timestamp: "2026-10-08T09:00:00Z", ingestionId: "fictional-sent-1" },
  { ...base, id: "reply-primary", direction: "inbound", body: reply, timestamp: referenceDate, ingestionId: "fictional-reply-1" }
];
export const outreach: Entity[] = [
  { ...base, id: "outreach-sent", body: messages[0].body, status: "sent", scheduledAt: null, factIds: [fact.id], claims: [{ id: "claim-sent", text: "Your team uses Salesforce", factIds: [fact.id] }], dependencyDiscovery: "explicit", version: 1 },
  { ...base, id: "outreach-dependent", body: "Following up on your Salesforce setup: Routewise can check whether your lead-routing rules send each lead to the right owner.", status: "queued", scheduledAt: "2026-10-12T09:00:00Z", factIds: [fact.id], claims: [{ id: "claim-crm", text: "Your team uses Salesforce", factIds: [fact.id] }], dependencyDiscovery: "explicit", version: 1 },
  { ...base, id: "outreach-general", body: "Hi Maya, happy to share a short introduction to Routewise if useful. Who reviews lead routing on your team?", status: "queued", scheduledAt: "2026-10-13T09:00:00Z", factIds: [], claims: [], dependencyDiscovery: "explicit", version: 1 }
];
export function seedPrimaryScenario(db: DatabaseSync): boolean {
  if (db.prepare("SELECT id FROM sellers WHERE id=?").get(seller.id)) return false;
  transaction(db, () => {
    db.prepare("INSERT INTO sellers(id,data) VALUES(?,?)").run(seller.id,JSON.stringify(seller));
    insertEntity(db,"companies",company); insertEntity(db,"contacts",contact);
    insertEntity(db,"evidence",evidence); insertEntity(db,"facts",fact);
    insertEntity(db,"conversations",{ ...base, id: base.conversationId });
    for (const item of messages) insertEntity(db,"messages",item);
    for (const item of outreach) insertEntity(db,"outreach",item);
  });
  return true;
}
