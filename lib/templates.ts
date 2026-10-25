import type { Operator, QType, Settings } from "@/lib/formLogic";

export type TemplateQuestion = {
  key: string; // a local nickname, used so rules can point at other questions
  type: QType;
  label: string;
  options?: string[];
  required?: boolean;
  settings?: Settings;
  condition?: { key: string; operator: Operator; value?: string };
};

export type Template = {
  id: string;
  name: string;
  description: string;
  title: string;
  welcome_message: string;
  completion_message: string;
  primary_color: string;
  questions: TemplateQuestion[];
};

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank form",
    description: "Start from scratch.",
    title: "Untitled form",
    welcome_message: "Hi! Let's get started.",
    completion_message: "Thanks for your response!",
    primary_color: "#8b5cf6",
    questions: [],
  },
  {
    id: "contact",
    name: "Contact form",
    description: "Name, email, topic and message.",
    title: "Contact us",
    welcome_message: "Hi! How can we help?",
    completion_message: "Thanks! We'll get back to you soon.",
    primary_color: "#8b5cf6",
    questions: [
      { key: "name", type: "text", label: "What's your name?", required: true, settings: { min_length: 2 } },
      { key: "email", type: "email", label: "What's your email address?", required: true },
      {
        key: "topic",
        type: "dropdown",
        label: "What is this about?",
        options: ["General question", "Support", "Partnership", "Other"],
        required: true,
      },
      { key: "message", type: "text", label: "How can we help?", required: true },
    ],
  },
  {
    id: "feedback",
    name: "Customer feedback",
    description: "Rating with follow-up questions that depend on the score.",
    title: "How did we do?",
    welcome_message: "Thanks for choosing us! This takes about a minute.",
    completion_message: "Thank you, your feedback helps us improve.",
    primary_color: "#d97706",
    questions: [
      { key: "rating", type: "rating", label: "How would you rate your experience?", required: true, settings: { max: 5 } },
      {
        key: "low",
        type: "text",
        label: "Sorry to hear that. What went wrong?",
        condition: { key: "rating", operator: "less_than", value: "3" },
      },
      {
        key: "high",
        type: "text",
        label: "Great! What did you like most?",
        condition: { key: "rating", operator: "greater_than", value: "3" },
      },
      { key: "recommend", type: "yes_no", label: "Would you recommend us to a friend?" },
      { key: "email", type: "email", label: "Leave your email if you'd like us to follow up" },
    ],
  },
  {
    id: "event",
    name: "Event registration",
    description: "Sessions, dates and dietary needs.",
    title: "Event registration",
    welcome_message: "Welcome! Let's get you registered.",
    completion_message: "You're registered. See you there!",
    primary_color: "#059669",
    questions: [
      { key: "name", type: "text", label: "What's your full name?", required: true },
      { key: "email", type: "email", label: "What's your email address?", required: true },
      {
        key: "session",
        type: "dropdown",
        label: "Which session will you attend?",
        options: ["Morning (9am)", "Afternoon (1pm)", "Evening (6pm)"],
        required: true,
      },
      { key: "date", type: "date", label: "Which date will you attend?", required: true },
      { key: "diet", type: "yes_no", label: "Do you have any dietary requirements?", required: true },
      {
        key: "diet_detail",
        type: "text",
        label: "Please tell us more",
        condition: { key: "diet", operator: "equals", value: "Yes" },
      },
    ],
  },
  {
    id: "job",
    name: "Job application",
    description: "Role, experience and CV upload.",
    title: "Job application",
    welcome_message: "Thanks for your interest! Let's start your application.",
    completion_message: "Application received. We'll be in touch.",
    primary_color: "#2563eb",
    questions: [
      { key: "name", type: "text", label: "What's your full name?", required: true },
      { key: "email", type: "email", label: "What's your email address?", required: true },
      {
        key: "role",
        type: "dropdown",
        label: "Which role are you applying for?",
        options: ["Frontend Developer", "Backend Developer", "Designer", "Other"],
        required: true,
      },
      {
        key: "years",
        type: "text",
        label: "How many years of experience do you have?",
        required: true,
        settings: { format: "number", error_message: "Please enter a number, e.g. 2" },
      },
      { key: "cv", type: "file_upload", label: "Upload your CV", required: true },
      {
        key: "why",
        type: "text",
        label: "Why do you want to join us?",
        settings: { min_length: 20, error_message: "Please write at least 20 characters." },
      },
    ],
  },
];