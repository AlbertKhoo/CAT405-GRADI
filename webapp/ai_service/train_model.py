import pandas as pd
import numpy as np
import os
import joblib
import warnings
from bs4 import BeautifulSoup
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, VotingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
from sklearn.base import BaseEstimator, TransformerMixin

# NLTK setup
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
import re

from preprocessor import TextPreprocessor

def load_hyperparameters():
    db_path = os.getenv("DATABASE_PATH", os.path.join("..", "database", "gradi.sqlite"))
    # Default values
    rf_estimators = 100
    gb_estimators = 100
    tfidf_features = 1000
    
    if os.path.exists(db_path):
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT rf_estimators, gb_estimators, tfidf_features FROM model_setup ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                rf_estimators, gb_estimators, tfidf_features = row
                print(f"Loaded config from DB: rf_estimators={rf_estimators}, gb_estimators={gb_estimators}, tfidf_features={tfidf_features}")
            conn.close()
        except Exception as e:
            print(f"Error reading model config from SQLite: {e}")
    else:
        print(f"Database not found at {db_path}, using defaults.")
            
    return rf_estimators, gb_estimators, tfidf_features

def save_metrics(rf_rmse, gb_rmse, ensemble_rmse):
    db_path = os.getenv("DATABASE_PATH", os.path.join("..", "database", "gradi.sqlite"))
    if os.path.exists(db_path):
        try:
            import sqlite3
            from datetime import datetime
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            last_trained = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            # Update the latest config row with these metrics
            cursor.execute("SELECT id FROM model_setup ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                config_id = row[0]
                cursor.execute("""
                    UPDATE model_setup 
                    SET rf_rmse = ?, gb_rmse = ?, ensemble_rmse = ?, last_trained = ?
                    WHERE id = ?
                """, (rf_rmse, gb_rmse, ensemble_rmse, last_trained, config_id))
            else:
                cursor.execute("""
                    INSERT INTO model_setup (rf_estimators, gb_estimators, tfidf_features, rf_rmse, gb_rmse, ensemble_rmse, last_trained)
                    VALUES (100, 100, 1000, ?, ?, ?, ?)
                """, (rf_rmse, gb_rmse, ensemble_rmse, last_trained))
            conn.commit()
            conn.close()
            print("Saved metrics to SQLite database.")
        except Exception as e:
            print(f"Error saving metrics to SQLite: {e}")

if __name__ == "__main__":
    try:
        print("Loading datasets...")
        dataset_dir = os.path.join("..", "..", "dataset")
        entries_df = pd.read_excel(os.path.join(dataset_dir, "logbook_entries.xlsx"))
        graded_df = pd.read_excel(os.path.join(dataset_dir, "logbook_graded.xlsx"))
        
        # 1. Compute project scores
        # Sum of GradeMultiplier per ProjectID, scaled to out of 10.
        project_scores = graded_df.groupby('ProjectID')['GradeMultiplier'].sum().reset_index()
        project_scores['TargetScore'] = project_scores['GradeMultiplier'] / 10.0
        
        print(f"Found grades for {len(project_scores)} projects.")
        
        # 2. Merge with entries
        df = pd.merge(entries_df, project_scores[['ProjectID', 'TargetScore']], on='ProjectID', how='left')
        
        # For projects without grades, set a default average score (e.g. 7.5) for training purposes to avoid discarding everything,
        # or just fillna based on the mean of TargetScore
        mean_score = df['TargetScore'].mean()
        if pd.isna(mean_score):
            mean_score = 7.5
        df['TargetScore'].fillna(mean_score, inplace=True)
        
        df['LogNotes'].fillna('', inplace=True)
        df['LogHours'].fillna(0, inplace=True)
        
        # Feature engineering: ensure LogHours is numeric
        df['LogHours'] = pd.to_numeric(df['LogHours'], errors='coerce').fillna(0)
        
        # In case there are very few samples (like just a few from dummy data), we duplicate rows to enable cv/training to not crash
        if len(df) < 50:
            print(f"Sample size too small ({len(df)}). Bootstrapping...")
            df = df.sample(50, replace=True)

        X = df[['LogNotes', 'LogHours']]
        y = df['TargetScore']
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # 3. Load Hyperparameters from DB
        rf_estimators, gb_estimators, tfidf_features = load_hyperparameters()

        # Create Preprocessor and ML Models
        print("Building NLP Pipeline and ML Models...")
        
        preprocessor = ColumnTransformer(
            transformers=[
                ('text', Pipeline([
                    ('clean', TextPreprocessor()),
                    ('tfidf', TfidfVectorizer(max_features=tfidf_features))
                ]), 'LogNotes'),
                ('num', StandardScaler(), ['LogHours'])
            ]
        )
        
        # Preprocess training and testing features
        print("Preprocessing features...")
        X_train_processed = preprocessor.fit_transform(X_train)
        X_test_processed = preprocessor.transform(X_test)
        
        # Models
        rf = RandomForestRegressor(n_estimators=rf_estimators, random_state=42)
        gb = GradientBoostingRegressor(n_estimators=gb_estimators, random_state=42)
        ensemble = VotingRegressor([('rf', rf), ('gb', gb)])
        
        # 4. Train and Evaluate Models
        print("Training and evaluating models...")
        
        # Random Forest
        rf.fit(X_train_processed, y_train)
        y_pred_rf = rf.predict(X_test_processed)
        rmse_rf = np.sqrt(mean_squared_error(y_test, y_pred_rf))
        
        # Gradient Boosting
        gb.fit(X_train_processed, y_train)
        y_pred_gb = gb.predict(X_test_processed)
        rmse_gb = np.sqrt(mean_squared_error(y_test, y_pred_gb))
        
        # VotingRegressor (Ensemble)
        ensemble.fit(X_train_processed, y_train)
        y_pred_ensemble = ensemble.predict(X_test_processed)
        rmse_ensemble = np.sqrt(mean_squared_error(y_test, y_pred_ensemble))
        
        # 5. Output Results in Terminal
        print("\n" + "="*60)
        print("Model Performance Comparison (Root Mean Square Error)")
        print("="*60)
        print(f"Random Forest Regressor       RMSE: {rmse_rf:.4f}")
        print(f"Gradient Boosting Regressor    RMSE: {rmse_gb:.4f}")
        print(f"VotingRegressor (Ensemble)     RMSE: {rmse_ensemble:.4f}")
        print("="*60 + "\n")
        
        # 6. Save Model Pipeline for Deployment
        pipeline = Pipeline(steps=[
            ('preprocessor', preprocessor),
            ('model', ensemble)
        ])
        joblib.dump(pipeline, "ai_model.pkl")
        print("Model saved to ai_model.pkl")
        
        # 7. Save Metrics to DB
        save_metrics(rmse_rf, rmse_gb, rmse_ensemble)
        
    except Exception as e:
        print(f"Error during training: {str(e)}")
