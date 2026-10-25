import { describe, expect, it } from "vitest";
import { isVisible, nextVisibleIndex, validateAnswer, type Question } from "../lib/formLogic";

let counter = 0;
function q(partial: Partial<Question> = {}): Question {
  counter += 1;
  return {
    id: `q${counter}`,
    type: "text",
    label: `Question ${counter}`,
    options: null,
    required: false,
    settings: null,
    condition: null,
    ...partial,
  };
}

describe("isVisible (conditional logic)", () => {
  it("shows questions that have no condition", () => {
    expect(isVisible(q(), {})).toBe(true);
  });

  it("matches 'equals' ignoring case and spaces", () => {
    const rule = q({ condition: { question_id: "src", operator: "equals", value: "Yes" } });
    expect(isVisible(rule, { src: " yes " })).toBe(true);
    expect(isVisible(rule, { src: "No" })).toBe(false);
  });

  it("hides a question whose source was never asked", () => {
    const rule = q({ condition: { question_id: "src", operator: "equals", value: "Yes" } });
    expect(isVisible(rule, {})).toBe(false);
  });

  it("handles skipped sources", () => {
    const answered = q({ condition: { question_id: "src", operator: "answered" } });
    const skipped = q({ condition: { question_id: "src", operator: "not_answered" } });
    expect(isVisible(answered, { src: null })).toBe(false);
    expect(isVisible(skipped, { src: null })).toBe(true);
    expect(isVisible(answered, { src: "hello" })).toBe(true);
  });

  it("compares numbers for ratings", () => {
    const low = q({ condition: { question_id: "r", operator: "less_than", value: "3" } });
    const high = q({ condition: { question_id: "r", operator: "greater_than", value: "3" } });
    expect(isVisible(low, { r: "2" })).toBe(true);
    expect(isVisible(low, { r: "5" })).toBe(false);
    expect(isVisible(high, { r: "5" })).toBe(true);
    expect(isVisible(high, { r: "abc" })).toBe(false);
    expect(isVisible(low, { r: null })).toBe(false);
  });

  it("supports 'contains' and 'not_equals'", () => {
    const has = q({ condition: { question_id: "s", operator: "contains", value: "cat" } });
    const not = q({ condition: { question_id: "s", operator: "not_equals", value: "cat" } });
    expect(isVisible(has, { s: "I love my Cat" })).toBe(true);
    expect(isVisible(has, { s: "dogs" })).toBe(false);
    expect(isVisible(not, { s: "dog" })).toBe(true);
    expect(isVisible(not, { s: "cat" })).toBe(false);
  });
});

describe("nextVisibleIndex", () => {
  const a = q({ id: "a", type: "yes_no" });
  const b = q({ id: "b", condition: { question_id: "a", operator: "equals", value: "Yes" } });
  const c = q({ id: "c" });
  const d = q({ id: "d", condition: { question_id: "b", operator: "answered" } });
  const all = [a, b, c, d];

  it("goes to the next question when its condition is met", () => {
    expect(nextVisibleIndex(all, 1, { a: "Yes" })).toBe(1);
  });

  it("skips questions whose condition isn't met", () => {
    expect(nextVisibleIndex(all, 1, { a: "No" })).toBe(2);
  });

  it("hides questions that depend on a hidden question", () => {
    expect(nextVisibleIndex(all, 3, { a: "No" })).toBe(-1);
  });

  it("shows a chained question once its source was answered", () => {
    expect(nextVisibleIndex(all, 3, { a: "Yes", b: "hello" })).toBe(3);
  });

  it("returns -1 when there is nothing left to ask", () => {
    expect(nextVisibleIndex(all, 4, { a: "Yes" })).toBe(-1);
  });
});

describe("validateAnswer", () => {
  it("accepts empty values (required-ness is checked elsewhere)", () => {
    expect(validateAnswer(q({ type: "email" }), "")).toBeNull();
  });

  it("checks email format", () => {
    const email = q({ type: "email" });
    expect(validateAnswer(email, "nope")).toMatch(/valid email/i);
    expect(validateAnswer(email, "ada@mail.com")).toBeNull();
  });

  it("enforces minimum and maximum length", () => {
    const text = q({ settings: { min_length: 5, max_length: 10 } });
    expect(validateAnswer(text, "abc")).toMatch(/at least 5/);
    expect(validateAnswer(text, "this is far too long")).toMatch(/under 10/);
    expect(validateAnswer(text, "just right")).toBeNull();
  });

  it("checks number, phone and URL formats", () => {
    const num = q({ settings: { format: "number" } });
    const phone = q({ settings: { format: "phone" } });
    const url = q({ settings: { format: "url" } });
    expect(validateAnswer(num, "12.5")).toBeNull();
    expect(validateAnswer(num, "abc")).toMatch(/number/i);
    expect(validateAnswer(phone, "+234 801 234 5678")).toBeNull();
    expect(validateAnswer(phone, "abc")).toMatch(/phone/i);
    expect(validateAnswer(url, "https://example.com")).toBeNull();
    expect(validateAnswer(url, "example.com")).toMatch(/URL/);
  });

  it("uses the owner's custom error message", () => {
    const text = q({ settings: { min_length: 20, error_message: "Tell us more please" } });
    expect(validateAnswer(text, "short")).toBe("Tell us more please");
  });

  it("enforces date limits", () => {
    const date = q({ type: "date", settings: { date_min: "2026-01-01", date_max: "2026-12-31" } });
    expect(validateAnswer(date, "2025-12-31")).toMatch(/on or after/);
    expect(validateAnswer(date, "2027-01-01")).toMatch(/on or before/);
    expect(validateAnswer(date, "2026-06-15")).toBeNull();
  });
});