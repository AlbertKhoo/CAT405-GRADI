import os
import pypdf
import pandas as pd

pdf_path = r"c:\Users\Albert Khoo.ANTAREX-MY-L005\Documents\Project\Project005_GRADI\CAT405_System Requirement and Design Report_Khoo Kaa Hong 164562.pdf"
dataset_dir = r"c:\Users\Albert Khoo.ANTAREX-MY-L005\Documents\Project\Project005_GRADI\dataset"

# Extract PDF text
print("Extracting PDF...")
try:
    with open(pdf_path, "rb") as f:
        reader = pypdf.PdfReader(f)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
    with open("tmp_pdf_text.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print(f"PDF extracted. Total chars: {len(text)}")
except Exception as e:
    print(f"Error extracting PDF: {e}")

# Extract Excel info
print("Extracting Excel info...")
try:
    with open("tmp_excel_info.txt", "w", encoding="utf-8") as f:
        for file in os.listdir(dataset_dir):
            if file.endswith(".xlsx"):
                f.write(f"=== File: {file} ===\n")
                file_path = os.path.join(dataset_dir, file)
                xls = pd.ExcelFile(file_path)
                f.write(f"Sheet names: {xls.sheet_names}\n")
                for sheet in xls.sheet_names:
                    df = pd.read_excel(file_path, sheet_name=sheet, nrows=5)
                    f.write(f"\nSheet '{sheet}' columns: {list(df.columns)}\n")
                    f.write(f"First 3 rows:\n{df.head(3).to_string()}\n")
                f.write("\n" + "="*40 + "\n\n")
    print("Excel info extracted.")
except Exception as e:
    print(f"Error extracting Excel info: {e}")

print("Done extraction")
