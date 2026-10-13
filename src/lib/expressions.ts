import { isApiInstant, isApiRecord } from "@/lib/api-response";

export type ExpressionInput = {
  expression: string;
  meaningPt: string;
  /** The bundle's idiomatic English equivalent; Inês can clarify its meaning. */
  meaningEn: string;
  literalEn: string;
  examples: string[];
  notes: string;
  sourceUrl: string;
  tags: string[];
  imageUrl: string;
  imageAlt: string;
};
export type Expression = ExpressionInput & {
  id: string;
  published: 0 | 1;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
export const EMPTY_EXPRESSION: ExpressionInput = {
  expression: "", meaningPt: "", meaningEn: "", literalEn: "", examples: [],
  notes: "", sourceUrl: "", tags: [], imageUrl: "", imageAlt: "",
};
export function expressionInput(value: ExpressionInput): ExpressionInput {
  return Object.fromEntries(Object.keys(EMPTY_EXPRESSION).map((key) => [key, value[key as keyof ExpressionInput]])) as ExpressionInput;
}
export function isExpression(value: unknown): value is Expression {
  if (!isApiRecord(value)) return false;
  return ["id", "expression", "meaningPt", "meaningEn", "literalEn", "notes", "sourceUrl", "imageUrl", "imageAlt"].every((key) => typeof value[key] === "string") &&
    typeof value.id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(value.id) &&
    ["examples", "tags"].every((key) => Array.isArray(value[key]) && value[key].every((item: unknown) => typeof item === "string")) &&
    (value.published === 0 || value.published === 1) && Number.isInteger(value.sortOrder) && Number(value.sortOrder) >= 0 &&
    isApiInstant(value.createdAt) && isApiInstant(value.updatedAt);
}
export function searchExpression(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-PT");
}
