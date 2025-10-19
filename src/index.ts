#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const execAsync = promisify(exec);

const server = new McpServer({
  name: "things-mcp",
  version: "0.1.0",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evaluateScriptPath = path.resolve(__dirname, "../scripts/things-evaluate-url.jxa");
const evaluateBinary = "/usr/bin/osascript";
async function openThingsURL(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [url]);

    child.on("error", (error) => {
      reject(new Error(`Failed to open Things URL: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to open Things URL: process exited with code ${code}`));
      }
    });
  });
}

function resolveAuthToken(paramToken?: string) {
  if (paramToken && paramToken.trim().length > 0) {
    return paramToken;
  }

  const envToken = process.env.THINGS_AUTH_TOKEN;
  if (envToken && envToken.trim().length > 0) {
    return envToken;
  }

  throw new Error(
    "Things auth token is required. Supply `auth-token` parameter or set THINGS_AUTH_TOKEN env var."
  );
}

const ChecklistItemSchema = z.union([
  z.string(),
  z.object({
    title: z.string(),
    completed: z.boolean().optional(),
  }),
]);

type ChecklistItemInput = z.infer<typeof ChecklistItemSchema>;

const StructuredTodoSchema = z.object({
  type: z.literal("to-do"),
  title: z.string(),
  notes: z.string().optional(),
  when: z.string().optional(),
  deadline: z.string().optional(),
  checklistItems: z.array(ChecklistItemSchema).optional(),
  tags: z.array(z.string()).optional(),
  canceled: z.boolean().optional(),
  completed: z.boolean().optional(),
  area: z.string().optional(),
  "area-id": z.string().optional(),
  "heading-id": z.string().optional(),
  "list-id": z.string().optional(),
  index: z.number().int().nonnegative().optional(),
});

type StructuredTodoInput = z.infer<typeof StructuredTodoSchema>;

const StructuredHeadingSchema = z.object({
  type: z.literal("heading"),
  title: z.string(),
  notes: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
  items: z.array(StructuredTodoSchema).optional(),
});

type _StructuredHeadingInput = z.infer<typeof StructuredHeadingSchema>;

const StructuredProjectItemSchema = z.union([StructuredHeadingSchema, StructuredTodoSchema]);

type StructuredProjectItemInput = z.infer<typeof StructuredProjectItemSchema>;

const StructuredProjectSchema = z.object({
  title: z.string(),
  notes: z.string().optional(),
  when: z.string().optional(),
  deadline: z.string().optional(),
  tags: z.array(z.string()).optional(),
  area: z.string().optional(),
  "area-id": z.string().optional(),
  canceled: z.boolean().optional(),
  completed: z.boolean().optional(),
  index: z.number().int().nonnegative().optional(),
  items: z.array(StructuredProjectItemSchema).optional(),
});

type StructuredProjectInput = z.infer<typeof StructuredProjectSchema>;

const RestructureHeadingSchema = z.object({
  type: z.literal("heading"),
  id: z.string().optional(),
  title: z.string().optional(),
  operation: z.enum(["create", "update", "move", "delete"]).optional(),
  index: z.number().int().nonnegative().optional(),
  items: z.array(z.string()).optional(),
});

const RestructureUnsectionedSchema = z.object({
  type: z.literal("unsectioned"),
  items: z.array(z.string()).optional(),
});

const RestructureLayoutItemSchema = z.union([
  RestructureHeadingSchema,
  RestructureUnsectionedSchema,
]);

type RestructureLayoutItemInput = z.infer<typeof RestructureLayoutItemSchema>;

function buildChecklistItems(items: ChecklistItemInput[] = []) {
  return items.map((item) => {
    if (typeof item === "string") {
      return {
        type: "checklist-item",
        attributes: {
          title: item,
        },
      };
    }

    return {
      type: "checklist-item",
      attributes: {
        title: item.title,
        ...(item.completed !== undefined && { completed: item.completed }),
      },
    };
  });
}

function buildTodo(todo: StructuredTodoInput) {
  const attributes: Record<string, unknown> = {
    title: todo.title,
  };

  if (todo.notes) attributes.notes = todo.notes;
  if (todo.when) attributes.when = todo.when;
  if (todo.deadline) attributes.deadline = todo.deadline;
  if (todo.tags?.length) attributes.tags = todo.tags;
  if (todo.canceled !== undefined) attributes.canceled = todo.canceled;
  if (todo.completed !== undefined) attributes.completed = todo.completed;
  if (todo.area) attributes.area = todo.area;
  if (todo["area-id"]) attributes["area-id"] = todo["area-id"];
  if (todo["heading-id"]) attributes["heading-id"] = todo["heading-id"];
  if (todo["list-id"]) attributes["list-id"] = todo["list-id"];
  if (todo.index !== undefined) attributes.index = todo.index;

  const checklistItems =
    todo.checklistItems && todo.checklistItems.length
      ? buildChecklistItems(todo.checklistItems)
      : undefined;

  return {
    type: "to-do",
    attributes,
    ...(checklistItems && { items: checklistItems }),
  };
}

function buildProjectItems(items: StructuredProjectItemInput[] = []) {
  return items.map((item) => {
    if (item.type === "heading") {
      const headingAttributes: Record<string, unknown> = {
        title: item.title,
      };
      if (item.notes) headingAttributes.notes = item.notes;
      if (item.index !== undefined) headingAttributes.index = item.index;

      return {
        type: "heading",
        attributes: headingAttributes,
        ...(item.items && item.items.length
          ? { items: item.items.map((todo) => buildTodo(todo)) }
          : {}),
      };
    }

    return buildTodo(item);
  });
}

function buildStructuredProjectPayload(project: StructuredProjectInput) {
  const attributes: Record<string, unknown> = {
    title: project.title,
  };

  if (project.notes) attributes.notes = project.notes;
  if (project.when) attributes.when = project.when;
  if (project.deadline) attributes.deadline = project.deadline;
  if (project.tags?.length) attributes.tags = project.tags;
  if (project.area) attributes.area = project.area;
  if (project["area-id"]) attributes["area-id"] = project["area-id"];
  if (project.canceled !== undefined) attributes.canceled = project.canceled;
  if (project.completed !== undefined) attributes.completed = project.completed;
  if (project.index !== undefined) attributes.index = project.index;

  const payload: Record<string, unknown> = {
    type: "project",
    attributes,
  };

  if (project.items?.length) {
    payload.items = buildProjectItems(project.items);
  }

  return [payload];
}

function buildRestructurePayload(projectId: string, layout: RestructureLayoutItemInput[]) {
  const headingOperations: Record<string, unknown>[] = [];
  const todoOperations: Record<string, unknown>[] = [];
  let headingIndex = 0;
  let todoIndex = 0;
  const createdHeadings: { id: string; title?: string }[] = [];

  layout.forEach((item) => {
    if (item.type === "heading") {
      const providedId = item.id;
      const generatedId = providedId ?? randomUUID();
      const operation =
        item.operation ||
        (providedId ? (item.title || item.index !== undefined ? "update" : "move") : "create");

      if (operation !== "delete") {
        const headingAttributes: Record<string, unknown> = {
          "project-id": projectId,
        };

        if (item.title) headingAttributes.title = item.title;
        headingAttributes.index = item.index !== undefined ? item.index : headingIndex;

        headingOperations.push({
          type: "heading",
          id: generatedId,
          operation,
          attributes: headingAttributes,
        });

        if (!providedId) {
          createdHeadings.push({
            id: generatedId,
            title: item.title,
          });
        }
      } else if (providedId) {
        headingOperations.push({
          type: "heading",
          id: providedId,
          operation: "delete",
        });
      }

      const targetHeadingId = operation === "delete" ? undefined : (providedId ?? generatedId);

      if (targetHeadingId && item.items?.length) {
        item.items.forEach((todoId) => {
          todoOperations.push({
            type: "to-do",
            id: todoId,
            operation: "move",
            attributes: {
              "list-id": projectId,
              "heading-id": targetHeadingId,
              index: todoIndex,
            },
          });
          todoIndex += 1;
        });
      }

      if (operation !== "delete") {
        headingIndex += 1;
      }
    } else if (item.type === "unsectioned" && item.items?.length) {
      item.items.forEach((todoId) => {
        todoOperations.push({
          type: "to-do",
          id: todoId,
          operation: "move",
          attributes: {
            "list-id": projectId,
            index: todoIndex,
          },
        });
        todoIndex += 1;
      });
    }
  });

  return {
    operations: [...headingOperations, ...todoOperations],
    createdHeadings,
  };
}

server.tool(
  "add-todo",
  {
    title: z.string().optional().describe("The title of the todo (ignored if titles is specified)"),
    titles: z.string().optional().describe("Multiple todo titles separated by new lines"),
    notes: z.string().optional().describe("Notes for the todo (max 10,000 chars)"),
    when: z
      .string()
      .optional()
      .describe(
        "When to schedule: today, tomorrow, evening, anytime, someday, date string, or date time string"
      ),
    deadline: z
      .string()
      .optional()
      .describe("Deadline date (YYYY-MM-DD format or natural language)"),
    tags: z.array(z.string()).optional().describe("Array of tag names"),
    "checklist-items": z.array(z.string()).optional().describe("Checklist items to add (max 100)"),
    "use-clipboard": z
      .enum(["replace-title", "replace-notes", "replace-checklist-items"])
      .optional()
      .describe("Use clipboard content"),
    "list-id": z
      .string()
      .optional()
      .describe("ID of project or area to add to (takes precedence over list)"),
    list: z.string().optional().describe("Title of project or area to add to"),
    "heading-id": z
      .string()
      .optional()
      .describe("ID of heading within project (takes precedence over heading)"),
    heading: z.string().optional().describe("Title of heading within project"),
    completed: z.boolean().optional().describe("Mark as completed"),
    canceled: z.boolean().optional().describe("Mark as canceled (takes priority over completed)"),
    "show-quick-entry": z
      .boolean()
      .optional()
      .describe("Show quick entry dialog instead of adding"),
    reveal: z.boolean().optional().describe("Navigate to and show the created todo"),
    "creation-date": z.string().optional().describe("ISO8601 date time string for creation date"),
    "completion-date": z
      .string()
      .optional()
      .describe("ISO8601 date time string for completion date"),
  },
  async (params) => {
    const urlParams = new URLSearchParams();

    // Handle title vs titles
    if (params.titles) {
      urlParams.set("titles", params.titles);
    } else if (params.title) {
      urlParams.set("title", params.title);
    }

    if (params.notes) urlParams.set("notes", params.notes);
    if (params.when) urlParams.set("when", params.when);
    if (params.deadline) urlParams.set("deadline", params.deadline);
    if (params.tags && params.tags.length > 0) urlParams.set("tags", params.tags.join(","));
    if (params["checklist-items"] && params["checklist-items"].length > 0) {
      urlParams.set("checklist-items", params["checklist-items"].join("\n"));
    }
    if (params["use-clipboard"]) urlParams.set("use-clipboard", params["use-clipboard"]);
    if (params["list-id"]) urlParams.set("list-id", params["list-id"]);
    if (params.list) urlParams.set("list", params.list);
    if (params["heading-id"]) urlParams.set("heading-id", params["heading-id"]);
    if (params.heading) urlParams.set("heading", params.heading);
    if (params.completed !== undefined) urlParams.set("completed", params.completed.toString());
    if (params.canceled !== undefined) urlParams.set("canceled", params.canceled.toString());
    if (params["show-quick-entry"] !== undefined)
      urlParams.set("show-quick-entry", params["show-quick-entry"].toString());
    if (params.reveal !== undefined) urlParams.set("reveal", params.reveal.toString());
    if (params["creation-date"]) urlParams.set("creation-date", params["creation-date"]);
    if (params["completion-date"]) urlParams.set("completion-date", params["completion-date"]);

    const url = `things:///add?${urlParams.toString()}`;
    await openThingsURL(url);

    const todoName = params.titles ? "todos" : `todo "${params.title || "untitled"}"`;
    return {
      content: [
        {
          type: "text",
          text: `${todoName} created successfully in Things`,
        },
      ],
    };
  }
);

server.tool(
  "add-project",
  {
    title: z.string().describe("The title of the project"),
    notes: z.string().optional().describe("Notes for the project (max 10,000 chars)"),
    when: z
      .string()
      .optional()
      .describe(
        "When to schedule: today, tomorrow, evening, anytime, someday, date string, or date time string"
      ),
    deadline: z
      .string()
      .optional()
      .describe("Deadline date (YYYY-MM-DD format or natural language)"),
    tags: z.array(z.string()).optional().describe("Array of tag names"),
    "area-id": z.string().optional().describe("ID of area to add to (takes precedence over area)"),
    area: z.string().optional().describe("Title of area to add to"),
    "to-dos": z
      .array(z.string())
      .optional()
      .describe("Array of todo titles to create in the project"),
    completed: z.boolean().optional().describe("Mark as completed"),
    canceled: z.boolean().optional().describe("Mark as canceled (takes priority over completed)"),
    reveal: z.boolean().optional().describe("Navigate into the created project"),
    "creation-date": z.string().optional().describe("ISO8601 date time string for creation date"),
    "completion-date": z
      .string()
      .optional()
      .describe("ISO8601 date time string for completion date"),
  },
  async (params) => {
    const urlParams = new URLSearchParams();
    urlParams.set("title", params.title);

    if (params.notes) urlParams.set("notes", params.notes);
    if (params.when) urlParams.set("when", params.when);
    if (params.deadline) urlParams.set("deadline", params.deadline);
    if (params.tags && params.tags.length > 0) urlParams.set("tags", params.tags.join(","));
    if (params["area-id"]) urlParams.set("area-id", params["area-id"]);
    if (params.area) urlParams.set("area", params.area);
    if (params["to-dos"] && params["to-dos"].length > 0) {
      urlParams.set("to-dos", params["to-dos"].join("\n"));
    }
    if (params.completed !== undefined) urlParams.set("completed", params.completed.toString());
    if (params.canceled !== undefined) urlParams.set("canceled", params.canceled.toString());
    if (params.reveal !== undefined) urlParams.set("reveal", params.reveal.toString());
    if (params["creation-date"]) urlParams.set("creation-date", params["creation-date"]);
    if (params["completion-date"]) urlParams.set("completion-date", params["completion-date"]);

    const url = `things:///add-project?${urlParams.toString()}`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text",
          text: `Project "${params.title}" created successfully in Things`,
        },
      ],
    };
  }
);

server.tool(
  "create-structured-project",
  {
    project: StructuredProjectSchema.describe(
      "Structured project definition with headings and todos"
    ),
    "auth-token": z
      .string()
      .optional()
      .describe("Authorization token (required if project uses updates)"),
    reveal: z.boolean().optional().describe("Navigate to the created project when finished"),
  },
  async (params) => {
    const payload = buildStructuredProjectPayload(params.project);
    const urlParams = new URLSearchParams();

    const authToken = params["auth-token"] ?? process.env.THINGS_AUTH_TOKEN ?? undefined;
    if (authToken) {
      urlParams.set("auth-token", authToken);
    }

    urlParams.set("data", JSON.stringify(payload));

    if (params.reveal !== undefined) {
      urlParams.set("reveal", params.reveal.toString());
    }

    const url = `things:///json?${urlParams.toString()}`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text",
          text: `Structured project "${params.project.title}" created successfully in Things`,
        },
      ],
    };
  }
);

server.tool(
  "update",
  {
    id: z.string().describe("The ID of the todo to update (required)"),
    "auth-token": z
      .string()
      .optional()
      .describe("Things URL scheme authorization token (omit if THINGS_AUTH_TOKEN is set)"),
    title: z.string().optional().describe("New title (replaces existing)"),
    notes: z.string().optional().describe("New notes (replaces existing, max 10,000 chars)"),
    "prepend-notes": z.string().optional().describe("Text to add before existing notes"),
    "append-notes": z.string().optional().describe("Text to add after existing notes"),
    when: z.string().optional().describe("When to schedule (cannot update repeating todos)"),
    deadline: z.string().optional().describe("Deadline date (cannot update repeating todos)"),
    tags: z.array(z.string()).optional().describe("Replace all current tags"),
    "add-tags": z.array(z.string()).optional().describe("Add these tags to existing ones"),
    "checklist-items": z
      .array(z.string())
      .optional()
      .describe("Replace all checklist items (max 100)"),
    "prepend-checklist-items": z
      .array(z.string())
      .optional()
      .describe("Add checklist items to front"),
    "append-checklist-items": z.array(z.string()).optional().describe("Add checklist items to end"),
    "list-id": z.string().optional().describe("ID of project/area to move to"),
    list: z.string().optional().describe("Title of project/area to move to"),
    "heading-id": z.string().optional().describe("ID of heading to move to"),
    heading: z.string().optional().describe("Title of heading to move to"),
    completed: z.boolean().optional().describe("Mark as completed/incomplete"),
    canceled: z.boolean().optional().describe("Mark as canceled/incomplete"),
    reveal: z.boolean().optional().describe("Navigate to and show the updated todo"),
    duplicate: z.boolean().optional().describe("Duplicate before updating"),
    "creation-date": z.string().optional().describe("ISO8601 date time string for creation date"),
    "completion-date": z
      .string()
      .optional()
      .describe("ISO8601 date time string for completion date"),
  },
  async (params) => {
    const urlParams = new URLSearchParams();
    const authToken = resolveAuthToken(params["auth-token"]);
    urlParams.set("id", params.id);
    urlParams.set("auth-token", authToken);

    if (params.title) urlParams.set("title", params.title);
    if (params.notes !== undefined) urlParams.set("notes", params.notes);
    if (params["prepend-notes"]) urlParams.set("prepend-notes", params["prepend-notes"]);
    if (params["append-notes"]) urlParams.set("append-notes", params["append-notes"]);
    if (params.when !== undefined) urlParams.set("when", params.when);
    if (params.deadline !== undefined) urlParams.set("deadline", params.deadline);
    if (params.tags) urlParams.set("tags", params.tags.join(","));
    if (params["add-tags"]) urlParams.set("add-tags", params["add-tags"].join(","));
    if (params["checklist-items"])
      urlParams.set("checklist-items", params["checklist-items"].join("\n"));
    if (params["prepend-checklist-items"])
      urlParams.set("prepend-checklist-items", params["prepend-checklist-items"].join("\n"));
    if (params["append-checklist-items"])
      urlParams.set("append-checklist-items", params["append-checklist-items"].join("\n"));
    if (params["list-id"]) urlParams.set("list-id", params["list-id"]);
    if (params.list) urlParams.set("list", params.list);
    if (params["heading-id"]) urlParams.set("heading-id", params["heading-id"]);
    if (params.heading) urlParams.set("heading", params.heading);
    if (params.completed !== undefined) urlParams.set("completed", params.completed.toString());
    if (params.canceled !== undefined) urlParams.set("canceled", params.canceled.toString());
    if (params.reveal !== undefined) urlParams.set("reveal", params.reveal.toString());
    if (params.duplicate !== undefined) urlParams.set("duplicate", params.duplicate.toString());
    if (params["creation-date"]) urlParams.set("creation-date", params["creation-date"]);
    if (params["completion-date"]) urlParams.set("completion-date", params["completion-date"]);

    const url = `things:///update?${urlParams.toString()}`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text",
          text: `Todo updated successfully in Things`,
        },
      ],
    };
  }
);

server.tool(
  "update-project",
  {
    id: z.string().describe("The ID of the project to update (required)"),
    "auth-token": z
      .string()
      .optional()
      .describe("Things URL scheme authorization token (omit if THINGS_AUTH_TOKEN is set)"),
    title: z.string().optional().describe("New title (replaces existing)"),
    notes: z.string().optional().describe("New notes (replaces existing, max 10,000 chars)"),
    "prepend-notes": z.string().optional().describe("Text to add before existing notes"),
    "append-notes": z.string().optional().describe("Text to add after existing notes"),
    when: z.string().optional().describe("When to schedule (cannot update repeating projects)"),
    deadline: z.string().optional().describe("Deadline date (cannot update repeating projects)"),
    tags: z.array(z.string()).optional().describe("Replace all current tags"),
    "add-tags": z.array(z.string()).optional().describe("Add these tags to existing ones"),
    "area-id": z.string().optional().describe("ID of area to move to"),
    area: z.string().optional().describe("Title of area to move to"),
    completed: z.boolean().optional().describe("Mark as completed/incomplete"),
    canceled: z.boolean().optional().describe("Mark as canceled/incomplete"),
    reveal: z.boolean().optional().describe("Navigate to and show the updated project"),
    duplicate: z.boolean().optional().describe("Duplicate before updating"),
    "creation-date": z.string().optional().describe("ISO8601 date time string for creation date"),
    "completion-date": z
      .string()
      .optional()
      .describe("ISO8601 date time string for completion date"),
  },
  async (params) => {
    const urlParams = new URLSearchParams();
    const authToken = resolveAuthToken(params["auth-token"]);
    urlParams.set("id", params.id);
    urlParams.set("auth-token", authToken);

    if (params.title) urlParams.set("title", params.title);
    if (params.notes !== undefined) urlParams.set("notes", params.notes);
    if (params["prepend-notes"]) urlParams.set("prepend-notes", params["prepend-notes"]);
    if (params["append-notes"]) urlParams.set("append-notes", params["append-notes"]);
    if (params.when !== undefined) urlParams.set("when", params.when);
    if (params.deadline !== undefined) urlParams.set("deadline", params.deadline);
    if (params.tags) urlParams.set("tags", params.tags.join(","));
    if (params["add-tags"]) urlParams.set("add-tags", params["add-tags"].join(","));
    if (params["area-id"]) urlParams.set("area-id", params["area-id"]);
    if (params.area) urlParams.set("area", params.area);
    if (params.completed !== undefined) urlParams.set("completed", params.completed.toString());
    if (params.canceled !== undefined) urlParams.set("canceled", params.canceled.toString());
    if (params.reveal !== undefined) urlParams.set("reveal", params.reveal.toString());
    if (params.duplicate !== undefined) urlParams.set("duplicate", params.duplicate.toString());
    if (params["creation-date"]) urlParams.set("creation-date", params["creation-date"]);
    if (params["completion-date"]) urlParams.set("completion-date", params["completion-date"]);

    const url = `things:///update-project?${urlParams.toString()}`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text",
          text: `Project updated successfully in Things`,
        },
      ],
    };
  }
);

server.tool(
  "restructure-project",
  {
    "project-id": z
      .string()
      .describe("Identifier of the project to restructure (from Share → Copy Link)"),
    "auth-token": z
      .string()
      .optional()
      .describe("Things URL scheme authorization token (omit if THINGS_AUTH_TOKEN is set)"),
    layout: z
      .array(
        RestructureLayoutItemSchema.describe(
          "Ordered layout blocks (headings or unsectioned items)"
        )
      )
      .min(1)
      .describe("Top-to-bottom layout describing headings and todos in desired order"),
  },
  async (params) => {
    const { operations, createdHeadings } = buildRestructurePayload(
      params["project-id"],
      params.layout
    );

    if (operations.length === 0) {
      throw new Error(
        "No operations generated from layout. Verify that headings or items are provided."
      );
    }

    const urlParams = new URLSearchParams();
    const authToken = resolveAuthToken(params["auth-token"]);
    urlParams.set("auth-token", authToken);
    urlParams.set("data", JSON.stringify(operations));

    const url = `things:///json?${urlParams.toString()}`;
    await openThingsURL(url);

    const resultTextLines = [`Project ${params["project-id"]} restructured successfully in Things`];

    if (createdHeadings.length) {
      resultTextLines.push(
        "New headings:",
        ...createdHeadings.map((heading) => `• ${heading.title ?? "(untitled)"} → ${heading.id}`)
      );
    }

    return {
      content: [
        {
          type: "text",
          text: resultTextLines.join("\n"),
        },
      ],
    };
  }
);

server.tool(
  "show",
  {
    id: z
      .string()
      .optional()
      .describe(
        "ID of area, project, tag, todo, or built-in list (inbox, today, anytime, upcoming, someday, logbook, tomorrow, deadlines, repeating, all-projects, logged-projects)"
      ),
    query: z.string().optional().describe("Name of area, project, tag, or built-in list to show"),
    filter: z.array(z.string()).optional().describe("Filter by tag names"),
  },
  async (params) => {
    const urlParams = new URLSearchParams();

    if (params.id) {
      urlParams.set("id", params.id);
    } else if (params.query) {
      urlParams.set("query", params.query);
    }

    if (params.filter && params.filter.length > 0) {
      urlParams.set("filter", params.filter.join(","));
    }

    const url = `things:///show?${urlParams.toString()}`;
    await openThingsURL(url);

    const target = params.id || params.query || "Things";
    return {
      content: [
        {
          type: "text",
          text: `Opened ${target} in Things`,
        },
      ],
    };
  }
);

const searchToolSchema = z.object({
  query: z.string().optional().describe("Search query"),
});

server.tool(
  "search",
  {
    query: z.string().optional().describe("Search query"),
  },
  async (rawParams) => {
    const parsed = searchToolSchema.safeParse(rawParams);
    if (!parsed.success) {
      throw new Error(parsed.error.errors.map((issue) => issue.message).join(", "));
    }

    const params = parsed.data;
    const urlParams = new URLSearchParams();
    if (params.query) urlParams.set("query", params.query);

    const url = `things:///search?${urlParams.toString()}`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text" as const,
          text: params.query
            ? `Searching for "${params.query}" in Things`
            : "Opened search in Things",
        },
      ],
    };
  }
);

const evaluateSchema = z
  .object({
    id: z.string().optional().describe("Things object id (from Share → Copy Link)"),
    url: z.string().optional().describe("Full Things URL such as things:///show?id=<ID>"),
  })
  .refine(
    (value) => {
      const hasId = Boolean(value.id);
      const hasUrl = Boolean(value.url);
      return (hasId || hasUrl) && !(hasId && hasUrl);
    },
    {
      message: "Provide either id or url, but not both",
    }
  );

server.tool(
  "evaluate",
  {
    id: z.string().optional().describe("Things object id (from Share → Copy Link)"),
    url: z.string().optional().describe("Full Things URL such as things:///show?id=<ID>"),
  },
  async (rawParams) => {
    const parsedRequest = evaluateSchema.safeParse(rawParams);
    if (!parsedRequest.success) {
      throw new Error(parsedRequest.error.errors.map((issue) => issue.message).join(", "));
    }

    const params = parsedRequest.data;
    const target = params.id ?? params.url;

    const command = `${evaluateBinary} -l JavaScript ${JSON.stringify(
      evaluateScriptPath
    )} ${JSON.stringify(target)}`;

    try {
      const { stdout } = await execAsync(command);
      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error("No data returned from Things evaluate script.");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (jsonError) {
        throw new Error(`Failed to parse Things evaluation result: ${String(jsonError)}`);
      }

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
      ) {
        const errorPayload = parsed as Record<string, unknown>;
        const errorMessage =
          typeof errorPayload.message === "string"
            ? errorPayload.message
            : JSON.stringify(errorPayload);
        throw new Error(`Things evaluate script returned error: ${errorMessage}`);
      }

      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              text: JSON.stringify(parsed, null, 2),
              uri: `things-evaluate://${encodeURIComponent(target ?? "")}`,
              mimeType: "application/json",
            },
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to evaluate Things item: ${error.message}`);
      }
      throw new Error("Failed to evaluate Things item due to unknown error.");
    }
  }
);

server.tool(
  "version",
  {
    // No parameters needed
  },
  async () => {
    const url = `things:///version`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text",
          text: "Retrieved Things version information",
        },
      ],
    };
  }
);

server.tool(
  "json",
  {
    "auth-token": z
      .string()
      .optional()
      .describe("Authorization token (required for update operations)"),
    data: z.string().describe("JSON string containing array of todo and project objects"),
    reveal: z.boolean().optional().describe("Navigate to and show the first created item"),
  },
  async (params) => {
    const urlParams = new URLSearchParams();

    const authToken = params["auth-token"] ?? process.env.THINGS_AUTH_TOKEN ?? undefined;
    if (authToken) {
      urlParams.set("auth-token", authToken);
    }

    urlParams.set("data", params.data);

    if (params.reveal !== undefined) {
      urlParams.set("reveal", params.reveal.toString());
    }

    const url = `things:///json?${urlParams.toString()}`;
    await openThingsURL(url);

    return {
      content: [
        {
          type: "text",
          text: "JSON data processed successfully in Things",
        },
      ],
    };
  }
);

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  console.log("0.1.0");
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    `
Things MCP Server v0.1.0

A Model Context Protocol server for Things 3 app integration.

Usage:
  things-mcp              Start the MCP server
  things-mcp --version    Show version number
  things-mcp --help       Show this help message

Configuration:
  Set THINGS_AUTH_TOKEN environment variable to avoid passing auth-token
  parameter for update operations.

Documentation: https://github.com/kevinberny/things-mcp
  `.trim()
  );
  process.exit(0);
}

// Validate JXA script exists at startup
if (!existsSync(evaluateScriptPath)) {
  console.error(`ERROR: JXA script not found at: ${evaluateScriptPath}`);
  console.error("Make sure the scripts/things-evaluate-url.jxa file exists and is accessible.");
  process.exit(1);
}

// Validate osascript binary exists
if (!existsSync(evaluateBinary)) {
  console.error(`ERROR: osascript binary not found at: ${evaluateBinary}`);
  console.error("This server requires macOS to function.");
  process.exit(1);
}

const transport = new StdioServerTransport();
await server.connect(transport);
