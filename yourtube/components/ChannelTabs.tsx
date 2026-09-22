    import React, { useState } from "react";
    import { Button } from "./ui/button";

    const tabs = [
    { id: "home", label: "Home" },
    { id: "videos", label: "Videos" },
    { id: "shorts", label: "Shorts" },
    { id: "playlists", label: "Playlists" },
    { id: "community", label: "Community" },
    { id: "about", label: "About" },
    ];

    const ChannelTabs = () => {
    const [activeTab, setActiveTab] = useState("videos");

    return (
        <div>
        <div>
            {tabs.map((tab) => (
            <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
            >
                {tab.label}
            </Button>
            ))}
        </div>
        </div>
    );
    };

export default ChannelTabs;