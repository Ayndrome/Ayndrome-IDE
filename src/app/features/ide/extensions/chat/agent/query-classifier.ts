// src/app/features/ide/extensions/chat/agent/query-classifier.ts
// Classifies user query intent WITHOUT calling an LLM.
// Weighted multi-label scoring — runs in <1ms, costs zero tokens.
// Used by the context gate to decide what to inject into the system prompt.

// ── Intent types ──────────────────────────────────────────────────────────────

export type QueryIntent =
    | "new_feature"      // build something new
    | "bug_fix"          // fix an existing problem
    | "question"         // asking about code / explaining
    | "refactor"         // restructure existing code
    | "run_command"      // run/build/test/install
    | "file_operation"   // create/delete/rename files
    | "ui_change"        // styling, layout, visual tweaks
    | "unknown";

export type ContextNeeds = {
    intent: QueryIntent;           // primary (highest-scoring) intent
    secondaryIntent?: QueryIntent; // second intent if multi-intent detected
    confidence: number;            // 0-1, how confident we are in the primary
    needsFileTree: boolean;
    needsPackageJson: boolean;
    needsActiveFile: boolean;
    needsGitDiff: boolean;
    maxFileTreeDepth: 1 | 2 | 3;
    reasoning: string;
};

// ── Weighted pattern rules ────────────────────────────────────────────────────
// Each rule has a weight. Multiple matching rules accumulate score.
// Higher weight = stronger signal for that intent.

type PatternRule = {
    pattern: RegExp;
    weight: number;
    /** If true, only match when pattern is near the BEGINNING of the query */
    anchorStart?: boolean;
};

const INTENT_RULES: Record<QueryIntent, PatternRule[]> = {

    question: [
        // Strong signals — sentence structure that implies a question
        { pattern: /^(what|how|why|when|where|who|which)\b/i, weight: 3, anchorStart: true },
        { pattern: /^(explain|describe|tell me|show me|walk me through)\b/i, weight: 3, anchorStart: true },
        { pattern: /\?$/, weight: 2 },
        // Weaker — could be question or instruction
        { pattern: /^(does|is|are|was|were|will|would|should|can|could)\b/i, weight: 2, anchorStart: true },
        { pattern: /\b(understand|meaning|difference between|what does|what is)\b/i, weight: 1.5 },
        { pattern: /\b(purpose|overview|how does .+ work)\b/i, weight: 1.5 },
    ],

    run_command: [
        { pattern: /\b(run|execute)\b/i, weight: 2 },
        { pattern: /\b(npm|yarn|pnpm|npx|pip|cargo|go run|make|docker)\b/i, weight: 3 },
        { pattern: /\b(install|uninstall)\b.{0,20}\b(package|dep|lib|module)\b/i, weight: 3 },
        { pattern: /\b(build|compile|bundle)\b/i, weight: 2 },
        { pattern: /\b(dev server|start server|stop server|restart)\b/i, weight: 3 },
        { pattern: /\b(lint|format|prettier|eslint)\b/i, weight: 2 },
        { pattern: /\b(deploy|push|publish)\b/i, weight: 2 },
    ],

    bug_fix: [
        { pattern: /\b(fix|debug|resolve|patch|hotfix)\b/i, weight: 2.5 },
        { pattern: /\b(error|bug|issue|problem|broken|failing|not working|crash)\b/i, weight: 2 },
        { pattern: /\b(exception|undefined is not|null reference|cannot read)\b/i, weight: 3 },
        { pattern: /\b(TypeError|ReferenceError|SyntaxError|RuntimeError)\b/i, weight: 3 },
        { pattern: /\b(stack trace|stacktrace|traceback)\b/i, weight: 2.5 },
        { pattern: /\b(doesn't work|isn't working|won't|stopped working)\b/i, weight: 2 },
        { pattern: /\b(wrong|incorrect|unexpected|should be)\b/i, weight: 1 },
        { pattern: /\b(regression|flaky|intermittent)\b/i, weight: 2 },
    ],

    refactor: [
        { pattern: /\b(refactor|restructure|reorganize|rewrite)\b/i, weight: 3 },
        { pattern: /\b(rename|move to|extract|split|merge|consolidate)\b/i, weight: 2 },
        { pattern: /\b(clean up|simplify|DRY|deduplicate|reduce duplication)\b/i, weight: 2.5 },
        { pattern: /\b(improve|optimize|make .+ (better|faster|cleaner))\b/i, weight: 1.5 },
        { pattern: /\b(too (long|complex|nested|messy))\b/i, weight: 2 },
        { pattern: /\b(convert .+ to|migrate|upgrade)\b/i, weight: 2 },
    ],

    file_operation: [
        { pattern: /\b(create|make|add)\b.{0,15}\b(file|folder|directory)\b/i, weight: 3 },
        { pattern: /\b(delete|remove)\b.{0,15}\b(file|folder|directory)\b/i, weight: 3 },
        { pattern: /\b(rename|move)\b.{0,15}\b(file|folder|directory)\b/i, weight: 3 },
        { pattern: /\b(copy|duplicate)\b.{0,15}\b(file|folder)\b/i, weight: 2 },
        { pattern: /\b(new file|new folder|mkdir)\b/i, weight: 2.5 },
    ],

    ui_change: [
        { pattern: /\b(style|styling|css|tailwind|color|font|layout|margin|padding)\b/i, weight: 2 },
        { pattern: /\b(responsive|mobile|desktop|viewport|breakpoint)\b/i, weight: 2 },
        { pattern: /\b(center|align|flex|grid|position|z-index)\b/i, weight: 1.5 },
        { pattern: /\b(button|modal|navbar|sidebar|header|footer|card|form)\b.{0,20}\b(look|appear|style|design|ui)\b/i, weight: 2.5 },
        { pattern: /\b(dark mode|light mode|theme|animation|hover|transition)\b/i, weight: 2 },
        { pattern: /\b(icon|image|logo|background|border|shadow|radius)\b/i, weight: 1 },
        { pattern: /\b(make it|should be)\b.{0,20}\b(bigger|smaller|centered|visible|hidden|sticky)\b/i, weight: 2.5 },
    ],

    new_feature: [
        { pattern: /\b(add|build|create|implement|make|write|generate)\b/i, weight: 1.5 },
        { pattern: /\b(set up|configure|integrate|connect|wire up)\b/i, weight: 2 },
        { pattern: /\b(feature|functionality|capability|support for)\b/i, weight: 2 },
        { pattern: /\b(page|screen|view|component|module|service|hook|endpoint|route)\b/i, weight: 1 },
        { pattern: /\b(authentication|authorization|login|signup|payment|search|filter|sort)\b/i, weight: 2 },
        { pattern: /\b(api|database|db|schema|migration|model|controller)\b/i, weight: 1.5 },
        { pattern: /\b(app|application|website|web app|dashboard|admin)\b/i, weight: 1.5 },
    ],

    unknown: [],
};

// ── Negation dampener ─────────────────────────────────────────────────────────
// "Don't run tests" should NOT score high for run_command.
// If the query contains negation near a keyword, dampen that intent.

const NEGATION_PATTERNS = [
    /\b(don'?t|do not|never|without|no need to|skip|stop|avoid|instead of)\b/i,
];

// ── Scoring engine ────────────────────────────────────────────────────────────

function scoreIntents(msg: string): Record<QueryIntent, number> {
    const scores: Record<QueryIntent, number> = {
        new_feature: 0,
        bug_fix: 0,
        question: 0,
        refactor: 0,
        run_command: 0,
        file_operation: 0,
        ui_change: 0,
        unknown: 0,
    };

    const hasNegation = NEGATION_PATTERNS.some(p => p.test(msg));
    const firstClause = msg.split(/[.,;!]\s/)[0] ?? msg; // first sentence/clause

    for (const [intent, rules] of Object.entries(INTENT_RULES) as [QueryIntent, PatternRule[]][]) {
        for (const rule of rules) {
            const target = rule.anchorStart ? firstClause : msg;
            if (rule.pattern.test(target)) {
                let w = rule.weight;

                // If negation detected and this keyword is near the negation, dampen
                if (hasNegation && intent !== "question") {
                    // Check if negation appears near this pattern's match
                    const match = rule.pattern.exec(msg);
                    if (match) {
                        const matchPos = match.index;
                        for (const np of NEGATION_PATTERNS) {
                            const negMatch = np.exec(msg);
                            if (negMatch && Math.abs(negMatch.index - matchPos) < 30) {
                                w *= 0.2; // heavy dampening
                                break;
                            }
                        }
                    }
                }

                scores[intent] += w;
            }
        }
    }

    // ── Heuristic adjustments ─────────────────────────────────────────────────

    // If "question" scores high but another intent also scores high,
    // the user is probably asking to DO something, not just asking about it.
    // e.g., "Can you add a login page?" → question + new_feature → new_feature wins
    const nonQuestionMax = Math.max(
        scores.new_feature, scores.bug_fix, scores.refactor,
        scores.run_command, scores.file_operation, scores.ui_change,
    );
    if (scores.question > 0 && nonQuestionMax >= scores.question * 0.6) {
        scores.question *= 0.4;
    }

    // "add error handling" → new_feature, not bug_fix
    // If both new_feature and bug_fix score, check for creation verbs
    if (scores.bug_fix > 0 && scores.new_feature > 0) {
        if (/\b(add|implement|create|build|write)\b/i.test(firstClause)) {
            scores.bug_fix *= 0.5;
        }
    }

    // Short messages with a question mark are almost always questions
    if (msg.endsWith("?") && msg.length < 60 && scores.question > 0) {
        scores.question *= 1.5;
    }

    return scores;
}

// ── Public classifier ─────────────────────────────────────────────────────────

export function classifyQuery(userMessage: string): ContextNeeds {
    const msg = userMessage.trim();

    // Edge case: very short or empty
    if (msg.length < 3) {
        return {
            intent: "unknown",
            confidence: 0,
            needsFileTree: true,
            needsPackageJson: true,
            needsActiveFile: false,
            needsGitDiff: false,
            maxFileTreeDepth: 1,
            reasoning: "Message too short to classify",
        };
    }

    const scores = scoreIntents(msg);

    // Sort intents by score descending
    const sorted = (Object.entries(scores) as [QueryIntent, number][])
        .filter(([intent]) => intent !== "unknown")
        .sort((a, b) => b[1] - a[1]);

    const [primaryIntent, primaryScore] = sorted[0] ?? ["unknown", 0];
    const [secondaryIntent, secondaryScore] = sorted[1] ?? ["unknown", 0];
    const totalScore = sorted.reduce((acc, [, s]) => acc + s, 0);

    // Confidence: how dominant is the primary intent?
    const confidence = totalScore > 0
        ? Math.min(primaryScore / totalScore, 1)
        : 0;

    // Multi-intent detection: if secondary is >50% of primary, it's meaningful
    const hasSecondary = secondaryScore > primaryScore * 0.5 && secondaryScore > 1;

    const intent = primaryScore > 0 ? primaryIntent : "unknown";

    // ── Map intent → context needs ────────────────────────────────────────────

    const needs = CONTEXT_NEEDS_MAP[intent];

    // If confidence is low, be generous with context
    if (confidence < 0.4) {
        needs.needsFileTree = true;
        needs.needsPackageJson = true;
        needs.maxFileTreeDepth = 2;
    }

    return {
        ...needs,
        intent,
        secondaryIntent: hasSecondary ? secondaryIntent : undefined,
        confidence: Math.round(confidence * 100) / 100,
        reasoning: `${intent}(${primaryScore.toFixed(1)})` +
            (hasSecondary ? ` + ${secondaryIntent}(${secondaryScore.toFixed(1)})` : "") +
            ` | confidence=${(confidence * 100).toFixed(0)}%`,
    };
}

// ── Context needs per intent ──────────────────────────────────────────────────

const CONTEXT_NEEDS_MAP: Record<QueryIntent, Omit<ContextNeeds, "intent" | "secondaryIntent" | "confidence" | "reasoning">> = {
    question: {
        needsFileTree: false,
        needsPackageJson: false,
        needsActiveFile: false,
        needsGitDiff: false,
        maxFileTreeDepth: 1,
    },
    run_command: {
        needsFileTree: false,
        needsPackageJson: true,
        needsActiveFile: false,
        needsGitDiff: false,
        maxFileTreeDepth: 1,
    },
    bug_fix: {
        needsFileTree: true,
        needsPackageJson: false,
        needsActiveFile: true,
        needsGitDiff: true,
        maxFileTreeDepth: 1,
    },
    refactor: {
        needsFileTree: true,
        needsPackageJson: false,
        needsActiveFile: true,
        needsGitDiff: false,
        maxFileTreeDepth: 2,
    },
    file_operation: {
        needsFileTree: true,
        needsPackageJson: false,
        needsActiveFile: false,
        needsGitDiff: false,
        maxFileTreeDepth: 1,
    },
    ui_change: {
        needsFileTree: true,
        needsPackageJson: false,
        needsActiveFile: true,
        needsGitDiff: false,
        maxFileTreeDepth: 1,
    },
    new_feature: {
        needsFileTree: true,
        needsPackageJson: true,
        needsActiveFile: false,
        needsGitDiff: false,
        maxFileTreeDepth: 2,
    },
    unknown: {
        needsFileTree: true,
        needsPackageJson: true,
        needsActiveFile: true,
        needsGitDiff: false,
        maxFileTreeDepth: 2,
    },
};

// ── Token estimator ───────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
    // ~3.5 chars per token for code-heavy content
    return Math.ceil(text.length / 3.5);
}