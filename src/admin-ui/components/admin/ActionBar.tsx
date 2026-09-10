import React, { useRef } from "react";

type ActionBarProps = {
    saveDisabled: boolean;
    restartDisabled: boolean;
    saveAndRestartDisabled: boolean;
    onSave: () => void;
    onRestart: () => void;
    onSaveAndRestart: () => void;
    onDownloadBackup: () => void;
    onRestoreBackup: (file: File) => void;
};

export function ActionBar(props: ActionBarProps): React.JSX.Element {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const selectBackup = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!window.confirm("Restore this backup and overwrite the current configuration?")) return;
        props.onRestoreBackup(file);
    };

    return (
        <div style={{ marginTop: "14px" }}>
            <button className="save" disabled={props.saveDisabled} onClick={props.onSave}>
                Save
            </button>
            <button
                className="add"
                style={{ marginLeft: "8px" }}
                disabled={props.saveAndRestartDisabled}
                onClick={props.onSaveAndRestart}
            >
                Save and restart
            </button>
            <button
                className="add"
                style={{ marginLeft: "8px" }}
                disabled={props.restartDisabled}
                onClick={props.onRestart}
            >
                Restart bot
            </button>
            <button className="add" style={{ marginLeft: "8px" }} disabled={props.restartDisabled}
                onClick={props.onDownloadBackup} title="Download configuration backup">
                <i className="fa-solid fa-download" aria-hidden="true"></i> Backup
            </button>
            <button className="add" style={{ marginLeft: "8px" }} disabled={props.restartDisabled}
                onClick={() => fileInputRef.current?.click()} title="Restore configuration backup">
                <i className="fa-solid fa-upload" aria-hidden="true"></i> Restore
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={selectBackup} />
            <p>Backups contain tokens, passwords and other secrets. Store downloaded files securely.</p>
        </div>
    );
}
