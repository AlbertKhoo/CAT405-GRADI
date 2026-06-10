// This module interacts with the Python AI microservice

async function predictScore(logHours, logNotes) {
    try {
        const response = await fetch('http://localhost:8000/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logHours: logHours || 0, logNotes: logNotes || "" })
        });
        if (!response.ok) throw new Error("HTTP error " + response.status);
        const data = await response.json();
        return data.score;
    } catch (e) {
        console.error("Error connecting to AI prediction service:", e.message);
        // Fallback computation
        return Math.min(10, 5 + ((logNotes||"").split(" ").length / 100));
    }
}

async function generateFeedback(score, logNotes) {
    try {
        const response = await fetch('http://localhost:8000/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: score || 0, logNotes: logNotes || "" })
        });
        if (!response.ok) throw new Error("HTTP error " + response.status);
        const data = await response.json();
        return data.feedback;
    } catch (e) {
        console.error("Error connecting to AI feedback service:", e.message);
        // Fallback mock
        return "Your entry is fine, but there seems to be an issue contacting the AI assistant. Keep up the good work!";
    }
}

function preprocessText(text) {
    // Left for legacy compatibility if needed elsewhere
    if (!text) return "";
    return text.toLowerCase().replace(/[^\w\s]/gi, '');
}

module.exports = {
    preprocessText,
    predictScore,
    generateFeedback
};
