    import HistoryContent from "@/components/historyContent";
    import React, { Suspense, useEffect, useState } from "react";

    const index = () => {
    return (
        <div>
        <div>
            <h1>Watch Histroy</h1>
            <Suspense fallback={<div>Loading...</div>}>
            <HistoryContent />
            </Suspense>
        </div>
        </div>
    );
    };

export default index;