import React from "react";

type ActionBarProps = {
    saveDisabled: boolean;
    restartDisabled: boolean;
    saveAndRestartDisabled: boolean;
    onSave: () => void;
    onRestart: () => void;
    onSaveAndRestart: () => void;
};

export function ActionBar(props: ActionBarProps): React.JSX.Element {
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
        </div>
    );
}
