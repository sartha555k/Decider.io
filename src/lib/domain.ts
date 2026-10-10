import type { Entity } from "./database";
export type Category =
  "technology" | "need" | "timing" | "responsibility" | "plans";
export type Scope = "company" | "team" | "contact" | "unknown";
export interface Fact extends Entity {
  category: Category;
  field: string;
  value: string;
  scope: Scope;
  evidenceId: string;
  status: "active" | "disputed" | "superseded";
  version: number;
  contactId: string | null;
}
export interface Evidence extends Entity {
  originalText: string;
  sourceType: string;
  scope: Scope;
}
export interface Outreach extends Entity {
  body: string;
  status: "draft" | "queued" | "paused" | "sent" | "cancelled";
  factIds: string[];
  claims: { id: string; text: string; factIds: string[] }[];
  dependencyDiscovery: "explicit" | "inferred" | "unknown";
  version: number;
}
export interface Seller extends Entity {
  name: string;
  integrations: string[];
  productDescription: string;
}
export interface Context {
  seller: Seller;
  company: Entity;
  contact: Entity;
  facts: Fact[];
  evidence: Evidence[];
  outreach: Outreach[];
  messages: Entity[];
  scenarioId: string;
}
export interface Correction {
  id: string;
  factId: string;
  category: Category;
  scope: Scope;
  relation: "contradicted" | "new_information" | "unclear" | "supported";
  replacementValue: string | null;
  quote: string;
  summary: string;
}
export interface Action {
  id: string;
  type: "update_fact" | "pause" | "rewrite" | "research" | "human_review";
  factId?: string;
  messageId?: string;
  expectedVersion?: number;
  newValue?: string;
  newBody?: string;
  scope?: Scope;
  quote?: string;
  reason: string;
  dependsOn?: string;
}
export interface Impact {
  messageId: string;
  affected: boolean;
  discovery: "explicit" | "inferred";
  reason: string;
  rewriteEligible: boolean;
}
export interface Assessment {
  corrections: Correction[];
  optOut: boolean;
  outcome:
    | "correction"
    | "multiple"
    | "ambiguous"
    | "no_correction"
    | "unrelated"
    | "opt_out";
  judgments: unknown[];
  mode: "practice" | "live";
  model?: string;
  usage?: {
    decisionInputTokens: number;
    generationInputTokens: number;
    generationOutputTokens?: number;
  };
  warnings: string[];
  offerRelevant?: boolean;
  failure?: string;
  impactOverrides?: {
    messageId: string;
    depends: boolean;
    repeats: boolean;
    supported: boolean;
  }[];
  draftSuggestions?: Record<string, string>;
}
export interface Review extends Entity {
  sourceReplyId: string;
  inputFingerprint: string;
  reply: string;
  hubspotSupported: boolean;
  scenarioId: string;
  assessment: Assessment;
  actions: Action[];
  impacts: Impact[];
  state: "needs_review" | "approved" | "rejected" | "stale" | "failed";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  selectedActionIds?: string[];
  operatorEdits?: Record<string, string>;
  comparedFacts?: Pick<Fact, "id" | "field" | "value" | "scope" | "version">[];
  cacheHit?: boolean;
  latencyMs: number;
}
