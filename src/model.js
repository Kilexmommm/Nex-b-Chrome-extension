export const DEFAULT_DATA = {
    workspaces: [{ id: "general", name: "General", type: "principal" }],
    activeWorkspaceId: "general",
    categories: [{ id: "ypf", name: "YPF", workspaceId: "general", parentId: "", accesses: [] }],
    settings: { themeId: "gris-nex", accentColor: "#4d8dff", backgroundColor: "#212121", backgroundImageUrl: "", backgroundPattern: "", thumbnailSize: "small", fontFamily: "system", cardStyle: "flat", cardBorder: "none", cardBorderColor: "#4a4a4a", cardSpacing: "normal", iconStyle: "minimal" },
    autoTagRules: { "google.com": "Google", "mail.google.com": "Gmail", "drive.google.com": "Drive", "docs.google.com": "Docs", "sheets.google.com": "Sheets", "slides.google.com": "Slides", "figma.com": "Figma", "miro.com": "Miro", "notion.so": "Notion", "github.com": "GitHub", "github.io": "GitHub" }
};
export const THEME_PRESETS = {
    "gris-nex": { name: "Gris Nex", accentColor: "#4d8dff", backgroundColor: "#212121", backgroundPattern: "linear-gradient(180deg,#252525 0%,#212121 100%)", light: false },
    papel: { name: "Papel", accentColor: "#c46746", backgroundColor: "#f4efe5", backgroundPattern: "repeating-linear-gradient(7deg,#75604706 0 1px,transparent 1px 4px),repeating-linear-gradient(97deg,#ffffff40 0 1px,transparent 1px 5px),radial-gradient(ellipse at 15% 0%,#fffdf6,transparent 70%),linear-gradient(135deg,#f4efe5,#e9dfce)", light: true },
    minimalista: { name: "Minimalista", accentColor: "#2f3437", backgroundColor: "#f4f1eb", backgroundPattern: "linear-gradient(135deg,#f8f6f1,#e8e2d8)", light: true },
    alegre: { name: "Alegre", accentColor: "#c65442", backgroundColor: "#fff5ed", backgroundPattern: "linear-gradient(135deg,#fff8ef 0%,#fce7df 52%,#e9f3ed 100%)", light: true },
    bosque: { name: "Bosque", accentColor: "#78b59c", backgroundColor: "#142621", backgroundPattern: "linear-gradient(145deg,#142621,#233b32 60%,#1b302c)", light: false },
    aurora: { name: "Aurora", accentColor: "#97d8cb", backgroundColor: "#091727", backgroundAsset: "assets/backgrounds/aurora.png", backgroundPattern: 'linear-gradient(rgba(4,12,26,.35),rgba(4,12,26,.55)),url("assets/backgrounds/aurora.png")', light: false },
    dunas: { name: "Dunas", accentColor: "#a85436", backgroundColor: "#f3e5d1", backgroundAsset: "assets/backgrounds/dunas.png", backgroundPattern: 'linear-gradient(rgba(255,248,234,.58),rgba(255,248,234,.65)),url("assets/backgrounds/dunas.png")', light: true },
    espacio: { name: "Espacio", accentColor: "#9ea8ff", backgroundColor: "#080b27", backgroundPattern: "radial-gradient(circle at 20% 20%,#6373d7 0 1px,transparent 2px),radial-gradient(circle at 70% 35%,#fff 0 1px,transparent 2px),radial-gradient(circle at 50% 80%,#7382ee 0 1px,transparent 2px),radial-gradient(ellipse at bottom,#18255d,#080b27 70%)", light: false },
    oscuro: { name: "Oscuro", accentColor: "#a9c7ff", backgroundColor: "#10131c", backgroundPattern: "radial-gradient(circle at 15% 0,#28375b 0,transparent 38%)", light: false },
    claro: { name: "Claro", accentColor: "#436dba", backgroundColor: "#eaf1ff", backgroundPattern: "linear-gradient(135deg,#f8fbff,#dfeaff)", light: true }
};
export const LIMITS = Object.freeze({ image: 8 * 1024 * 1024, archive: 64 * 1024 * 1024, data: 80 * 1024 * 1024, accesses: 2000 });
const fail = (message) => { throw new Error(message); };
function record(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        fail(label + ": formato inválido.");
    return value;
}
function text(value, label, max = 200, empty = false) {
    if (typeof value !== "string" || value.length > max || (!empty && !value.trim()))
        fail(label + ": texto inválido.");
    return value.trim();
}
function list(value, label, max) {
    if (!Array.isArray(value) || value.length > max)
        fail(label + ": lista inválida o demasiado grande.");
    return value;
}
function enumValue(value, allowed, label) {
    if (!allowed.includes(value))
        fail(label + ": valor no permitido.");
    return value;
}
export function webUrl(value) {
    const raw = text(value, "URL", 8192);
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        fail("URL inválida.");
    }
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password)
        fail("Usa una URL HTTP/HTTPS sin credenciales.");
    return parsed.href;
}
export function accessUrl(value) {
    try {
        return webUrl(value);
    }
    catch {
        const raw = text(value, "URL", 8192);
        let parsed;
        try { parsed = new URL(raw); }
        catch { fail("URL inválida."); }
        if (parsed.protocol !== "file:" || (parsed.hostname && parsed.hostname !== "localhost") || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.pathname.startsWith("/"))
            fail("Usa una URL HTTP/HTTPS o file:// local sin parámetros.");
        return parsed.href;
    }
}
export function imageUrl(value = "") {
    if (value === "")
        return "";
    if (typeof value !== "string")
        fail("Imagen inválida.");
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        if (value.length > LIMITS.image * 4 / 3 + 100 || value.split(",")[1].length % 4)
            fail("Imagen inválida o mayor de 8 MB.");
        return value;
    }
    const url = webUrl(value);
    if (!url.startsWith("https:"))
        fail("Las imágenes remotas deben usar HTTPS.");
    return url;
}
export function domainOf(value) {
    try {
        return new URL(value).hostname.replace(/^www\./, "");
    }
    catch {
        return "";
    }
}
export function validateRules(value) {
    record(value, "Reglas");
    if (Object.keys(value).length > 300)
        fail("Máximo 300 reglas.");
    const rules = {};
    for (const [domain, tag] of Object.entries(value)) {
        const host = domain.toLowerCase();
        if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host) || host.length > 253)
            fail("Dominio inválido en reglas: " + domain);
        rules[host] = text(tag, "Tag", 80);
    }
    return rules;
}
export function normalizeData(stored = DEFAULT_DATA) {
    record(stored, "Configuración");
    if (!Array.isArray(stored.categories))
        fail('La configuración no contiene categorías válidas.');
    if (JSON.stringify(stored).length > LIMITS.data)
        fail("Configuración demasiado grande.");
    if (stored.schemaVersion !== undefined && stored.schemaVersion !== 1)
        fail("Versión de configuración no compatible.");
    const workspaceIds = new Set(), categoryIds = new Set(), accessIds = new Set();
    const uniqueId = (value, set) => {
        const id = text(value, "Identificador", 120);
        if (set.has(id))
            fail("Identificador duplicado: " + id);
        set.add(id);
        return id;
    };
    const workspaces = list(stored.workspaces ?? DEFAULT_DATA.workspaces, "Workspaces", 100).map((w) => {
        record(w, "Workspace");
        return { id: uniqueId(w.id, workspaceIds), name: text(w.name, "Workspace", 120), type: enumValue(w.type ?? "standard", ["principal", "standard"], "Tipo") };
    });
    if (!workspaces.length)
        fail("Debe existir al menos un Workspace.");
    const categories = list(stored.categories, "Categorías", 500).map((c) => {
        record(c, "Categoría");
        const workspaceId = c.workspaceId ?? workspaces[0].id;
        if (!workspaceIds.has(workspaceId))
            fail("Categoría con Workspace inexistente.");
        const bookmarkFolderId = text(c.bookmarkFolderId ?? "", "Carpeta de favoritos", 120, true);
        const bookmarkFolderTitle = text(c.bookmarkFolderTitle ?? "", "Nombre de carpeta de favoritos", 120, true);
        return {
            id: uniqueId(c.id, categoryIds), name: text(c.name, "Categoría", 120), workspaceId,
            parentId: text(c.parentId ?? "", "Categoría padre", 120, true),
            ...(bookmarkFolderId ? { bookmarkFolderId, bookmarkFolderTitle } : {}),
            accesses: list(c.accesses ?? [], "Accesos", LIMITS.accesses).map((a) => {
                record(a, "Acceso");
                const bookmarkId = text(a.bookmarkId ?? "", "Favorito de Chrome", 120, true);
                const accessBookmarkFolderId = text(a.bookmarkFolderId ?? "", "Carpeta de favorito", 120, true);
                return { id: uniqueId(a.id, accessIds), title: text(a.title, "Nombre de acceso", 300),
                    url: accessUrl(a.url), matchType: enumValue(a.matchType ?? "document", ["document", "exact", "domain"], "Detección"),
                    tags: [...new Set(list(a.tags ?? [], "Tags", 50).map(t => text(t, "Tag", 80)))],
                    thumbnail: imageUrl(a.thumbnail ?? ""),
                    ...(bookmarkId && accessBookmarkFolderId ? { bookmarkId, bookmarkFolderId: accessBookmarkFolderId, bookmarkMissing: Boolean(a.bookmarkMissing) } : {}) };
            })
        };
    });
    if (accessIds.size > LIMITS.accesses)
        fail("Máximo 2000 accesos.");
    for (const c of categories) {
        if (!c.parentId)
            continue;
        const parent = categories.find(p => p.id === c.parentId);
        if (!parent || parent.id === c.id || parent.workspaceId !== c.workspaceId || parent.parentId)
            fail("Subcategoría inválida (solo un nivel).");
    }
    const s = { ...DEFAULT_DATA.settings, ...record(stored.settings ?? {}, "Estilos") };
    const themeId = enumValue(s.themeId, [...Object.keys(THEME_PRESETS), "custom"], "Estilo");
    for (const color of [s.accentColor, s.backgroundColor])
        if (!/^#[0-9a-f]{6}$/i.test(color))
            fail("Color inválido.");
    // Never accept arbitrary CSS from an imported backup.
    const backgroundPattern = Object.values(THEME_PRESETS).some(p => p.backgroundPattern === s.backgroundPattern) ? s.backgroundPattern : "";
    return { schemaVersion: 1, workspaces, categories,
        activeWorkspaceId: workspaceIds.has(stored.activeWorkspaceId) ? stored.activeWorkspaceId : workspaces[0].id,
        settings: { themeId, accentColor: s.accentColor, backgroundColor: s.backgroundColor,
            backgroundImageUrl: imageUrl(s.backgroundImageUrl), backgroundPattern,
            captureEnabled: typeof s.captureEnabled === 'boolean' ? s.captureEnabled : true,
            thumbnailSize: enumValue(s.thumbnailSize, ["small", "medium", "large"], "Miniaturas"),
            fontFamily: enumValue(s.fontFamily, ["system", "rounded", "serif", "mono"], "Fuente"),
            cardStyle: enumValue(s.cardStyle, ["flat", "soft", "glass"], "Estilo de tarjeta"),
            cardBorder: enumValue(s.cardBorder, ["none", "soft", "strong"], "Borde de tarjeta"),
            cardBorderColor: /^#[0-9a-f]{6}$/i.test(s.cardBorderColor) ? s.cardBorderColor : fail("Color de borde inválido."),
            cardSpacing: enumValue(s.cardSpacing, ["compact", "normal", "wide"], "Separación de tarjetas"),
            iconStyle: enumValue(s.iconStyle, ["minimal", "filled", "round"], "Estilo de icono") },
        autoTagRules: validateRules(stored.autoTagRules ?? DEFAULT_DATA.autoTagRules) };
}
export function documentKey(value) {
    const url = new URL(webUrl(value));
    // Document IDs are case sensitive. Unknown apps keep query and fragment.
    if (url.hostname === "docs.google.com") {
        const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([^/]+)/);
        if (match)
            return url.origin + "/" + match[1] + "/d/" + match[2];
    }
    if (url.hostname === "drive.google.com") {
        const match = url.pathname.match(/^\/file\/d\/([^/]+)/);
        const id = match?.[1] || (url.pathname === "/open" ? url.searchParams.get("id") : null);
        if (id)
            return url.origin + "/file/d/" + id;
    }
    if (["www.figma.com", "figma.com"].includes(url.hostname)) {
        const match = url.pathname.match(/^\/(?:file|design|proto|board)\/([^/]+)/);
        if (match)
            return "https://figma.com/doc/" + match[1];
    }
    if (url.hostname === "miro.com") {
        const match = url.pathname.match(/^\/app\/board\/([^/]+)/);
        if (match)
            return url.origin + "/app/board/" + match[1];
    }
    return url.href;
}
export function matches(access, tabUrl) {
    try {
        const url = accessUrl(access.url);
        // Los archivos no comparten un dominio: cada ruta identifica un acceso.
        if (url.startsWith("file:"))
            return url === accessUrl(tabUrl);
        if (access.matchType === "domain")
            return new URL(webUrl(access.url)).origin === new URL(webUrl(tabUrl)).origin;
        if (access.matchType === "exact")
            return webUrl(access.url) === webUrl(tabUrl);
        return documentKey(access.url) === documentKey(tabUrl);
    }
    catch {
        return false;
    }
}
