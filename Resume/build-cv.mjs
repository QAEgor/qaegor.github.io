import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(scriptDir, 'cv.md');
const outputPath = path.join(scriptDir, '..', 'assets', 'CV Egor Borisenko.pdf');

const browserCandidates = [
    process.env.CHROME_PATH,
    // Local Chrome hands off to a running instance and exits with code 21 instead of printing
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);

// "Main text | 2020 – Present" renders as a row with the dates right-aligned
const DATE_ROW_PATTERN = /^(.*?)\s+\|\s+(\d{4}\s*[–-]\s*(?:\d{4}|Present))$/;

const styles = `
    @page { size: A4; margin: 10mm 13mm; }
    body { font-family: Arial, sans-serif; font-size: 9.7pt; line-height: 1.3; color: #333; margin: 0; }
    h2, h3 { break-after: avoid; }
    a { color: #007BFF; text-decoration: none; }
    h1 { font-size: 22pt; letter-spacing: 1px; text-align: center; margin: 0; }
    h1 + p { font-size: 12pt; font-weight: bold; text-align: center; margin: 2px 0; }
    h1 + p + p { text-align: center; margin: 0 0 6px; }
    h2 { font-size: 12pt; text-transform: uppercase; border-bottom: 2px solid #333; padding-bottom: 2px; margin: 10px 0 5px; }
    h3 { font-size: 10.5pt; margin: 8px 0 1px; }
    h3 + p { font-style: italic; margin: 0 0 2px; }
    p { margin: 0 0 4px; }
    ul { margin: 2px 0 4px; padding-left: 16px; }
    li { margin-bottom: 2px; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .dates { white-space: nowrap; }
`;

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderInline = (text) =>
    escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

const renderLine = (text, tag) => {
    const dateRow = text.match(DATE_ROW_PATTERN);
    if (!dateRow) return `<${tag}>${renderInline(text)}</${tag}>`;

    const [, mainText, dates] = dateRow;
    return `<${tag} class="row"><span>${renderInline(mainText)}</span><strong class="dates">${escapeHtml(dates)}</strong></${tag}>`;
};

const markdownToHtml = (markdown) => {
    const htmlParts = [];
    let listItems = [];

    const flushList = () => {
        if (listItems.length === 0) return;
        htmlParts.push(`<ul>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
        listItems = [];
    };

    for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (line.startsWith('- ')) {
            listItems.push(line.slice(2));
            continue;
        }

        flushList();
        if (!line) continue;

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        htmlParts.push(heading ? renderLine(heading[2], `h${heading[1].length}`) : renderLine(line, 'p'));
    }

    flushList();
    return htmlParts.join('\n');
};

const buildHtmlDocument = (body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CV Egor Borisenko</title>
<style>${styles}</style>
</head>
<body>
${body}
</body>
</html>`;

const findBrowser = () => {
    const browserPath = browserCandidates.find((candidate) => existsSync(candidate));
    if (!browserPath) throw new Error('Chrome/Edge not found. Set CHROME_PATH to the browser executable.');
    return browserPath;
};

const countPdfPages = async (pdfPath) => {
    const pdfContent = (await readFile(pdfPath)).toString('latin1');
    return (pdfContent.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
};

const buildCv = async () => {
    const markdown = await readFile(sourcePath, 'utf8');
    const workDir = await mkdtemp(path.join(tmpdir(), 'cv-build-'));
    const htmlPath = path.join(workDir, 'cv.html');

    try {
        await writeFile(htmlPath, buildHtmlDocument(markdownToHtml(markdown)), 'utf8');
        execFileSync(
            findBrowser(),
            [
                '--headless=new',
                '--disable-gpu',
                '--no-pdf-header-footer',
                `--user-data-dir=${path.join(workDir, 'profile')}`,
                `--print-to-pdf=${outputPath}`,
                pathToFileURL(htmlPath).href,
            ],
            { stdio: 'ignore' },
        );
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }

    console.log(`PDF built: ${outputPath} (${await countPdfPages(outputPath)} page(s))`);
};

await buildCv();
