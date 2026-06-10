from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import os
import pandas as pd
from dotenv import load_dotenv
import sqlite3

# We must import the TextPreprocessor so joblib can unpickle it
from preprocessor import TextPreprocessor 

# Try to import Gemini
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

load_dotenv()

app = FastAPI(title="GRADI AI Inference Engine")

# Load compiled model
MODEL_PATH = "ai_model.pkl"
pipeline = None

@app.on_event("startup")
def load_model():
    global pipeline
    if os.path.exists(MODEL_PATH):
        try:
            pipeline = joblib.load(MODEL_PATH)
            print("Successfully loaded AI Model pipeline.")
        except Exception as e:
            print(f"Error loading model: {e}")
    else:
        print("Model file not found. Ensure train_model.py has been run.")

class PredictRequest(BaseModel):
    logNotes: str
    logHours: float

class PredictResponse(BaseModel):
    score: float

class FeedbackRequest(BaseModel):
    logNotes: str
    score: float

class FeedbackResponse(BaseModel):
    feedback: str

@app.post("/predict", response_model=PredictResponse)
def predict_score(req: PredictRequest):
    if not pipeline:
        # Fallback to simple logic if model isn't trained
        score = min(10, 5 + len(req.logNotes.split())/100)
        return {"score": score}
        
    df = pd.DataFrame([{
        "LogNotes": req.logNotes,
        "LogHours": req.logHours
    }])
    
    try:
        raw_score = float(pipeline.predict(df)[0])
        # The ML model trained directly on 'GradeMarks' which scales up to 20 or higher.
        # Normalize it back down softly to a standard 10.0 ceiling.
        score = (raw_score / 20.0) * 10.0
        
        # Add slight heuristic variance to prevent flat identical scores
        v_hours = max(-1.0, min(1.0, (req.logHours - 4.0) * 0.1))
        v_words = max(-0.5, min(0.5, (len(req.logNotes.split()) - 60) * 0.01))
        score = score + v_hours + v_words
        score = max(5.0, min(10.0, score)) # bound the output between 5 and 10 to ensure realistic grading
        return {"score": round(score, 1)}
    except Exception as e:
        print(f"Prediction Error: {e}")
        return {"score": 5.0}

def get_feedback_prompt():
    db_path = os.getenv("DATABASE_PATH", os.path.join("..", "database", "gradi.sqlite"))
    default_prompt = (
        "You are an AI teaching assistant grading a student's logbook entry.\n"
        "The student's entry log notes: \"{logNotes}\"\n"
        "The AI model predicted a score of {score}/10.0 for this entry.\n\n"
        "Generate personalized, constructive feedback (2-3 sentences).\n"
        "Focus on encouraging the student, highlighting what they did well, and pointing out areas for improvement "
        "such as adding more technical depth or reflection if the score is low."
    )
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT feedback_prompt FROM system_config ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row and row[0]:
                default_prompt = row[0]
            conn.close()
        except Exception as e:
            print(f"Error reading prompt config from SQLite: {e}")
    return default_prompt

@app.post("/feedback", response_model=FeedbackResponse)
def generate_feedback(req: FeedbackRequest):
    api_key = os.getenv("GEMINI_API_KEY")
    prompt_template = get_feedback_prompt()
    prompt = prompt_template.replace("{logNotes}", req.logNotes).replace("{score}", f"{req.score:.1f}")
    
    # Check if Gemini is available
    if genai and api_key and api_key != "your_gemini_api_key_here":
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            return {"feedback": response.text.strip()}
        except Exception as e:
            print(f"Gemini API Error: {e}")
            # Fallthrough to mock
            
    # Mock LLM generation
    if req.score >= 8:
        fb = "Excellent entry. Your reflections are well-articulated and show deep understanding of the task. Keep up the high standard of logging."
    elif req.score >= 5:
        fb = "Good effort on this entry. Consider including more technical specifics and a brief reflection on challenges to push it to the next level."
    else:
        fb = "This entry is quite brief. Ensure that next time, you provide sufficient detail about your daily tasks, problems encountered, and solutions devised."
    
    return {"feedback": fb}

