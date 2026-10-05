# Beeblio

Beeblio is a full-stack AI research workspace. It collaborates with you and works directly in your folders & documents. The Next.js interface and Eve agent run locally on your computer, and each project points to an existing folder.

This is intended for a single trusted user on one computer.

![Annotated Beeblio workspace showing the research artifact browser, document editor, and AI assistant](./public/image.png)

## What you can do

Beeblio brings writing, an AI research assistant, and your project files into one workspace:

- **Write with your sources beside you.** The [document editor](./app/%5BprojectId%5D/_components/editors/tiptap-document-editor.tsx) supports rich Markdown editing, tables, math, images, inline citations, and a generated bibliography. Search for literature or insert a citation from the editor, and use document review and sentence suggestions while you write. Export finished work as DOCX, citation-aware DOCX, LaTeX, or portable Markdown.
- **Work with an agent in the same project.** The [chat](./app/_components/agent-chat.tsx) can use the open file, `@`-mentioned files, uploaded files, and selected passages as context. The [Eve agent](./agent/) can search literature and the web, inspect and edit project files, update bibliographies and literature matrices, and run local Bash or Python workflows. Conversations are saved per project so you can return to earlier work.
- **Keep the research organized.** The [workspace rail](./app/%5BprojectId%5D/_components/project-layout-ui.tsx) combines a searchable [file explorer](./app/%5BprojectId%5D/_components/file-explorer.tsx) with [literature search and library](./app/%5BprojectId%5D/_components/literature-panel.tsx). Browse references, data, analysis, reports, and figures in the [artifact views](./app/%5BprojectId%5D/_components/research-artifact-browser.tsx); upload files, create folders and research artifacts, and open them alongside the chat.

The project [session page](./app/%5BprojectId%5D/%5B%5B...sessionId%5D%5D/page.tsx) connects the workspace to a new or saved conversation. Your project remains an ordinary folder on disk, so files you create or edit in Beeblio are available to your other tools.

## Requirements

- Node.js 24 and pnpm 11
- An OpenRouter API key and model ID for the agent
- Bash and Python 3 for local agent commands and analysis
- Optional: LibreOffice (`soffice`) for agent-assisted Office-to-PDF conversion; other command-line tools and Python packages for the workflows you want to run

In the browser, the folder picker uses macOS's native chooser; on other systems, enter an existing absolute folder path in the project form. The [desktop app](#desktop-app) has a native folder picker on every platform.

## Run locally

```bash
pnpm install
cp .env.example .env.local
# Set OPENROUTER_API_KEY and OPENROUTER_MODEL_ID in .env.local
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The root URL redirects to `/workspace`. `pnpm dev` creates `.beeblio/` if needed, applies SQLite migrations, and starts both the Next.js UI and the Eve agent. They listen on `127.0.0.1:3000` and `127.0.0.1:2000` respectively.

Choose **Link Project Folder** to select a folder. You can also paste its absolute path. Beeblio stores the resolved path in SQLite and works with the files in place. On linking, it adds any missing canonical files & folders: `1-References/`, `2-Data/`, `3-Analysis/`, and `4-Reports/` folders, plus `1-References/references.bib` and `3-Analysis/literature-matrix.matrix`. Existing files are preserved. Agent file tools display the folder as `/workspace`; agent shell commands run on your computer with that folder as the working directory. `$BEEBLIO_PROJECT_DIR` contains its absolute path.

## Desktop app

The desktop app runs the same local servers in their own window, so you don't need a browser tab. It runs from this checkout and has the same requirements as above, plus [Git for Windows](https://git-scm.com/download/win) on Windows: the agent runs shell commands with its Git Bash, and Python must be available as `python3` there.

```bash
pnpm install
pnpm --dir desktop install
pnpm build && pnpm build:eve
pnpm desktop
```

`pnpm desktop` serves the production builds, so build again after you pull changes. `pnpm desktop:dev` runs the development servers with hot reload instead and needs no build. The first launch downloads Electron.

The desktop app uses the same `.env.local` and `.beeblio/` data as `pnpm dev`, so it shows the same projects and conversations. Don't run both at once. The interface listens on `127.0.0.1:3210`; set `BEEBLIO_DESKTOP_PORT` to use another port. The agent uses any free local port. Server output is written to `servers.log` in the app's log folder (**File → Open Logs**). Links to other websites open in your default browser.

## Configuration

The main agent needs `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_ID`, and `OPENROUTER_MODEL_CONTEXT_WINDOW_TOKENS`. Set the context window to the token limit of the OpenRouter model you selected. You can also enter the OpenRouter key in the app under **Settings → API Keys** (account menu, or **Settings…** in the desktop app's menu). Beeblio checks the key with OpenRouter, stores it in `.beeblio/credentials.json`, and uses it right away instead of the `.env.local` value; remove it there to fall back to `.env.local`. Copy [`.env.example`](./.env.example) for all settings:

| Setting | Used for |
| --- | --- |
| `OPENROUTER_MODEL_ID_LITE` | Lightweight tasks such as conversation titles and sentence suggestions |
| `OPENROUTER_REQUEST_TIMEOUT_MS` | Optional limit for one agent model request, in milliseconds; unset means no time limit. Agent turns have no fixed time limit. |
| `OPENROUTER_MODEL_ID_REVIEW` | Document review; falls back to the main model |
| `OPENROUTER_VISION_MODEL_ID` | Image analysis; falls back to the main model if it supports vision |
| `GOOGLE_API_KEY`, `GOOGLE_TRANSCRIPTION_MODEL_ID` | Google key and selected transcription model for audio transcription |
| `GOOGLE_KNOWLEDGE_EMBEDDING_MODEL_ID`, `GOOGLE_KNOWLEDGE_QUERY_MODEL_ID` | Selected Google models for creating and querying Knowledge stores |
| `MONID_API_KEY`, `BRAVE_SEARCH_API_KEY` | Optional research and web tools |
| `CROSSREF_MAILTO` | Contact address for scholarly metadata requests |
| `PUBLIC_TUNNEL_ORIGIN` | Public HTTPS origin of a tunnel to the local UI, used for Office Online previews and share links |

The application has one local user and no browser login or accounts checks. Keep the servers bound to loopback: the agent's Bash tool uses your computer's own environment and can access files outside a project folder through shell commands.

## Where data lives

- **Project files:** Your linked folders. Browser uploads, downloads, and agent file operations use local filesystem routes.
- **Application data:** `.beeblio/beeblio.sqlite` stores projects, conversation state, knowledge metadata, and share records. Schema migrations are in [`drizzle/`](./drizzle/).
- **Internal secret:** `.beeblio/agent-secret` is generated automatically for the local UI-to-agent connection.
- **API keys from Settings:** `.beeblio/credentials.json`, readable only by your user account.
- **Agent compute:** Eve runs Bash and Python on the host. No Docker image or separate database server is required. The bundled `beeblio_research` Python helper is available to agent commands; other Python packages come from your local environment.

Beeblio still calls external model and research APIs when those features are used. Back up both your project folders and `.beeblio/` if you need to preserve files and conversation history.

## Documents

The Markdown editor can export DOCX, DOCX with Mendeley or Zotero citations, LaTeX, and portable Markdown. Office files in the workspace open in Microsoft's read-only Office Online viewer. Because Microsoft fetches the file itself, local previews require a public HTTPS tunnel to `127.0.0.1:3000` and its base URL in `PUBLIC_TUNNEL_ORIGIN`; restart `pnpm dev` after changing it. The Share button also uses this origin for links that others can open. Keep the tunnel running while using either feature. The tunnel exposes the app, and Office previews send the viewed file to Microsoft's service.

To make a PDF, export DOCX and convert it with your local document software or ask the agent to do it. LibreOffice is optional for that local conversion; it is not used by the current Office file viewer.

The Share button creates a public link for a file. When `PUBLIC_TUNNEL_ORIGIN` is set, the link uses that tunnel even if you opened Beeblio through localhost. Keep the app and tunnel running for others to view shared files or submit shared forms; form responses are saved in the project folder.

## Development commands

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm build:eve
pnpm db:migrate
pnpm --dir desktop typecheck
```
