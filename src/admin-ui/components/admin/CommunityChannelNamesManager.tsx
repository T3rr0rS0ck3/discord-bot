import React, { useMemo, useRef, useState } from "react";

const pageSize = 100;

export function CommunityChannelNamesManager(props: {
    names: string[];
    busy: boolean;
    onAdd: (name: string) => Promise<void>;
    onRename: (currentName: string, nextName: string) => Promise<void>;
    onDelete: (name: string) => Promise<void>;
    onExport: () => Promise<void>;
    onImport: (file: File) => Promise<void>;
}): React.JSX.Element {
    const [query, setQuery] = useState("");
    const [newName, setNewName] = useState("");
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editedName, setEditedName] = useState("");
    const [visibleCount, setVisibleCount] = useState(pageSize);
    const importInputRef = useRef<HTMLInputElement | null>(null);

    const filteredNames = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase("de");
        if (!normalizedQuery) return props.names;
        return props.names.filter(name => name.toLocaleLowerCase("de").includes(normalizedQuery));
    }, [props.names, query]);
    const visibleNames = filteredNames.slice(0, visibleCount);

    const resetPaging = (): void => setVisibleCount(pageSize);

    const addName = async (): Promise<void> => {
        if (!newName.trim()) return;
        await props.onAdd(newName);
        setNewName("");
        resetPaging();
    };

    const saveRename = async (): Promise<void> => {
        if (!editingName || !editedName.trim()) return;
        await props.onRename(editingName, editedName);
        setEditingName(null);
        setEditedName("");
        resetPaging();
    };

    return (
        <section className="community-name-manager" aria-labelledby="community-name-manager-title">
            <div className="community-name-manager-head">
                <div>
                    <strong id="community-name-manager-title">Community-Kanalnamen</strong>
                    <span className="muted">{filteredNames.length} von {props.names.length}</span>
                </div>
                <div className="community-name-actions">
                    <button type="button" className="add icon-btn" disabled={props.busy} onClick={() => void props.onExport()} title="Kanalnamen exportieren">
                        <i className="fa-solid fa-download" aria-hidden="true"></i> Export
                    </button>
                    <button type="button" className="add icon-btn" disabled={props.busy} onClick={() => importInputRef.current?.click()} title="Kanalnamen importieren">
                        <i className="fa-solid fa-upload" aria-hidden="true"></i> Import
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void props.onImport(file).then(resetPaging);
                        }}
                    />
                </div>
            </div>

            <div className="community-name-toolbar">
                <input
                    type="search"
                    value={query}
                    placeholder="Kanalnamen durchsuchen"
                    aria-label="Community-Kanalnamen durchsuchen"
                    onChange={event => {
                        setQuery(event.target.value);
                        resetPaging();
                    }}
                />
                <div className="community-name-add">
                    <input
                        value={newName}
                        maxLength={100}
                        placeholder="Neuen Kanalnamen eingeben"
                        aria-label="Neuer Community-Kanalname"
                        disabled={props.busy}
                        onChange={event => setNewName(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === "Enter") void addName();
                        }}
                    />
                    <button type="button" className="add icon-btn icon-only" disabled={props.busy || !newName.trim()} onClick={() => void addName()} title="Kanalname hinzufügen" aria-label="Kanalname hinzufügen">
                        <i className="fa-solid fa-plus" aria-hidden="true"></i>
                    </button>
                </div>
            </div>

            <div
                className="community-name-list"
                onScroll={event => {
                    const element = event.currentTarget;
                    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 80) {
                        setVisibleCount(current => Math.min(current + pageSize, filteredNames.length));
                    }
                }}
            >
                {visibleNames.length === 0 ? <div className="community-name-empty">Keine Kanalnamen gefunden.</div> : visibleNames.map(name => (
                    <div className="community-name-row" key={name}>
                        {editingName === name ? (
                            <input
                                value={editedName}
                                maxLength={100}
                                aria-label={`Kanalname ${name} bearbeiten`}
                                autoFocus
                                onChange={event => setEditedName(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === "Enter") void saveRename();
                                    if (event.key === "Escape") setEditingName(null);
                                }}
                            />
                        ) : <span>{name}</span>}
                        <div className="community-name-row-actions">
                            {editingName === name ? (
                                <>
                                    <button type="button" className="save icon-btn icon-only" disabled={!editedName.trim()} onClick={() => void saveRename()} title="Änderung speichern" aria-label={`Kanalname ${name} speichern`}>
                                        <i className="fa-solid fa-check" aria-hidden="true"></i>
                                    </button>
                                    <button type="button" className="add icon-btn icon-only" onClick={() => setEditingName(null)} title="Bearbeitung abbrechen" aria-label={`Bearbeitung von ${name} abbrechen`}>
                                        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                                    </button>
                                </>
                            ) : (
                                <button type="button" className="add icon-btn icon-only" disabled={props.busy} onClick={() => { setEditingName(name); setEditedName(name); }} title="Kanalname bearbeiten" aria-label={`Kanalname ${name} bearbeiten`}>
                                    <i className="fa-solid fa-pen" aria-hidden="true"></i>
                                </button>
                            )}
                            <button type="button" className="del icon-btn icon-only" disabled={props.busy} onClick={() => void props.onDelete(name)} title="Kanalname löschen" aria-label={`Kanalname ${name} löschen`}>
                                <i className="fa-solid fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                ))}
                {visibleNames.length < filteredNames.length ? (
                    <div className="community-name-more" role="status">Scrollen, um weitere Einträge anzuzeigen ({visibleNames.length}/{filteredNames.length})</div>
                ) : null}
            </div>
        </section>
    );
}
