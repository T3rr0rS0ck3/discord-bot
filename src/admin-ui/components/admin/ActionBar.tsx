import React from "react";

type ActionBarProps = {
    saveDisabled: boolean;
    saveAndRestartDisabled: boolean;
    onSave: () => void;
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
        </div>
    );
}
