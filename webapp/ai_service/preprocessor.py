from sklearn.base import BaseEstimator, TransformerMixin
from bs4 import BeautifulSoup
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
import re
import nltk

class TextPreprocessor(BaseEstimator, TransformerMixin):
    def __init__(self):
        self.lemmatizer = WordNetLemmatizer()
        self.stop_words = set(stopwords.words('english'))
        
    def fit(self, X, y=None):
        return self
        
    def transform(self, X):
        return [self.clean_text(str(text)) for text in X]
        
    def clean_text(self, text):
        # Remove HTML
        text = BeautifulSoup(text, "html.parser").get_text(separator=" ")
        # Lowercase
        text = text.lower()
        # Remove special characters
        text = re.sub(r'[^a-zA-Z\s]', '', text)
        # Tokenize and lemmatize
        tokens = text.split()
        tokens = [self.lemmatizer.lemmatize(word) for word in tokens if word not in self.stop_words]
        return " ".join(tokens)
