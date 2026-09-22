    import React, { useState } from "react";
    import { Avatar, AvatarFallback } from "./ui/avatar";
    import { Button } from "./ui/button";

    const ChannelHeader = ({ channel, user }: any) => {
    const [isSubscribed, setIsSubscribed] = useState(false);

    return (
        <div className="w-full">
        <div className="relative h-32 md:h-48 lg:h-64 bg-gradient-to-r from-blue-400 to-purple-500 overflow-hidden"></div>

        <div>
            <div>
            <Avatar>
                <AvatarFallback>{channel?.name[0]}</AvatarFallback>
            </Avatar>

            <div>
                <h1>{channel?.name}</h1>
                <div>
                <span>
                    @{channel?.name.toLowerCase().replace(/\s+/g, "")}
                </span>
                </div>

                {channel?.description && <p>{channel.description}</p>}
            </div>

            {user && user?._id === channel?._id && (
                <div>
                <Button onClick={() => setIsSubscribed(!isSubscribed)}>
                    {isSubscribed ? "Unsubscribe" : "Subscribe"}
                </Button>
                </div>
            )}
            </div>
        </div>
        </div>
    );
    };

export default ChannelHeader;