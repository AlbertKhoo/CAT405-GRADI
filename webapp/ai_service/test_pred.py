import pandas as pd
import joblib
from preprocessor import TextPreprocessor

pipeline = joblib.load('ai_model.pkl')
df = pd.DataFrame([{'LogNotes': 'Arrived at the office. Checked my emails and replied to a few messages. Worked on the website. Fixed some bugs in the code. Left early because there wasnt much else to do.', 'LogHours': 1}])
print('Raw RF score:', pipeline.predict(df)[0])
