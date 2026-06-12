import definePlugin from "@utils/types";

const USE_ALL_CAPS = false;
// false = General Chat
// true = GENERAL CHAT

const CHANNEL_ROOT_SELECTOR = [
    'a[href^="/channels/"][aria-label*="text channel" i]',
    '[role="treeitem"][aria-label*="text channel" i]',
    '[data-list-item-id^="channels___"][aria-label*="text channel" i]',
    '[aria-label="Channel header" i]',
    'section[aria-label="Channel header" i]',
].join(",");

let observer: MutationObserver | undefined;
let queued = false;

const originalTextNodes = new WeakMap<Text, string>();
const touchedTextNodes = new Set<Text>();

const ACRONYMS = new Set([
    "sasp",
    "bcso",
    "lspd",
    "ems",
    "saems",
    "doj",
    "cad",
    "mdt",
    "sop",
    "loa",
    "bolo",
    "rp",
]);

function formatWord(word: string): string {
    const cleaned = word.trim();

    if (!cleaned) return "";

    const lower = cleaned.toLowerCase();

    if (USE_ALL_CAPS) return lower.toUpperCase();

    if (ACRONYMS.has(lower)) return lower.toUpperCase();

    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function prettyChannelName(input: string): string {
    const leadingSpace = input.match(/^\s*/)?.[0] ?? "";
    const trailingSpace = input.match(/\s*$/)?.[0] ?? "";
    const trimmed = input.trim();

    if (!trimmed) return input;

    const hasHash = trimmed.startsWith("#");
    const rawName = trimmed.replace(/^#\s*/, "");

    const match = rawName.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9\s-]*)$/);

    if (!match) return input;

    const prefix = match[1];
    const channelNamePart = match[2];

    const formatted = channelNamePart
        .split(/[-\s]+/)
        .filter(Boolean)
        .map(formatWord)
        .join(" ");

    return `${leadingSpace}${hasHash ? "# " : ""}${prefix}${formatted}${trailingSpace}`;
}

function shouldSkipTextNode(node: Text): boolean {
    const parent = node.parentElement;

    if (!parent) return true;

    return Boolean(
        parent.closest("textarea, input, [contenteditable='true']")
    );
}

function prettifyElement(element: Element): void {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
                if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;

                return NodeFilter.FILTER_ACCEPT;
            },
        }
    );

    const textNodes: Text[] = [];

    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    for (const node of textNodes) {
        const current = node.nodeValue ?? "";
        const next = prettyChannelName(current);

        if (next === current) continue;

        if (!originalTextNodes.has(node)) {
            originalTextNodes.set(node, current);
        }

        touchedTextNodes.add(node);
        node.nodeValue = next;
    }
}

function run(): void {
    document
        .querySelectorAll(CHANNEL_ROOT_SELECTOR)
        .forEach(prettifyElement);
}

function queueRun(): void {
    if (queued) return;

    queued = true;

    requestAnimationFrame(() => {
        queued = false;
        run();
    });
}

export default definePlugin({
    name: "PrettyChannelNames",
    description: "Displays text channel names with spaces and capital letters instead of Discord's lowercase-dash format.",
    authors: [{ name: "Taako", id: 0n }],

    start() {
        run();

        observer = new MutationObserver(queueRun);

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    },

    stop() {
        observer?.disconnect();
        observer = undefined;

        for (const node of touchedTextNodes) {
            const original = originalTextNodes.get(node);

            if (original && node.isConnected) {
                node.nodeValue = original;
            }
        }

        touchedTextNodes.clear();
    },
});
