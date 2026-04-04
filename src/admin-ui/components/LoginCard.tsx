import React from "react";
import type { StatusState } from "../types";

type LoginCardProps = {
    username: string;
    token: string;
    loginStatus: StatusState;
    onUsernameChange: (value: string) => void;
    onTokenChange: (value: string) => void;
    onLogin: () => void;
};

export function LoginCard(props: LoginCardProps): React.JSX.Element {
    function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        props.onLogin();
    }

    return (
        <div className="site-shell">
            <header className="site-header">
                <div className="brand-wrap">
                    <img className="brand-logo" src="https://appnaxx.de/assets/logo.png" alt="appnaxx logo" />
                    <div>
                        <span className="brand-title">appnaxx.de</span>
                        <span className="brand-badge">Discord Bot Admin</span>
                    </div>
                </div>
                <nav className="header-links" aria-label="External links">
                    <a href="https://appnaxx.de" target="_blank" rel="noreferrer">Website</a>
                    <a href="https://github.com/T3rr0rS0ck3/discord-bot" target="_blank" rel="noreferrer">GitHub</a>
                </nav>
            </header>

            <div className="wrap">
                <div className="card">
                    <form onSubmit={handleSubmit}>
                        <h1><strong>Bot</strong> Control Center</h1>
                        <p>Sign in with your admin credentials to manage modules and runtime settings.</p>
                        <label>Username</label>
                        <input
                            type="text"
                            placeholder="Username"
                            value={props.username}
                            onChange={(event) => props.onUsernameChange(event.target.value)}
                        />
                        <label>Password</label>
                        <input
                            type="password"
                            placeholder="Password"
                            value={props.token}
                            onChange={(event) => props.onTokenChange(event.target.value)}
                        />
                        <button className="save" type="submit">
                            Sign in
                        </button>
                        <div className="status" style={{ color: props.loginStatus.color }}>
                            {props.loginStatus.text}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
