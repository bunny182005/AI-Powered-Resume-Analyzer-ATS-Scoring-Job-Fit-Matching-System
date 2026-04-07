import streamlit as st
import requests
import time

st.set_page_config(page_title="OptiMatch ATS | Enterprise", layout="wide")
API_URL = "http://127.0.0.1:8000/api/v1/analyze"

st.title("🎯 OptiMatch ATS")
st.markdown("**Semantic Vector-Matching Engine & Precision Scorer**")
st.markdown("---")

col1, col2 = st.columns(2)

with col1:
    st.subheader("📝 Target Job Description")
    jd_text = st.text_area("Paste the job requirements here:", height=300)

with col2:
    st.subheader("📄 Upload Candidate Resume")
    st.info("Upload a PDF or DOCX format.")
    uploaded_file = st.file_uploader("Choose a file...", type=["pdf", "docx"])

st.markdown("<br>", unsafe_allow_html=True)

if st.button("🚀 Calculate Match Score", type="primary", use_container_width=True):
    if not jd_text or not uploaded_file:
        st.warning("⚠️ Please provide both a Job Description and upload a Resume.")
    else:
        try:
            # 1. THE STATUS BLOCK (API CALL)
            with st.status("Initializing AI Pipeline...", expanded=True) as status:
                st.write("📄 Parsing Document...")
                time.sleep(0.5) 
                st.write("🧮 Running Vector Semantic Search (Grouping keywords like AI & ML)...")
                time.sleep(0.5)
                st.write("🧠 Generating Final 100-Point Score...")
                
                # Send the physical file + JD to the API
                files = {"file": (uploaded_file.name, uploaded_file, "application/pdf")}
                data = {"job_description": jd_text}
                
                response = requests.post(API_URL, data=data, files=files)
                response.raise_for_status()
                result = response.json()
                
                status.update(label="✅ Analysis Complete!", state="complete", expanded=False)
            
            # 2. THE RESULTS BLOCK
            st.markdown("---")
            score = result.get('match_score', 0)
            
            # 1. The Main Score
            st.markdown("### 🏆 Overall Match Score")
            score_col, blank_col = st.columns([1, 2])
            with score_col:
                if score >= 80:
                    st.success(f"# {score} / 100 (Strong Match 🟢)")
                elif score >= 50:
                    st.warning(f"# {score} / 100 (Moderate Match 🟡)")
                else:
                    st.error(f"# {score} / 100 (Low Match 🔴)")
            
            st.progress(min(max(score / 100.0, 0.0), 1.0))
            
            st.markdown("---")
            
            # 2. The Precision Metric
            metrics = result.get("keyword_metrics", {})
            matched_count = len(metrics.get("matched", []))
            total_count = metrics.get("total", 1)
            precision_ratio = matched_count / total_count if total_count > 0 else 0
            
            st.markdown(f"### 🎯 Keyword Precision: {matched_count} of {total_count} Skills Found")
            st.progress(min(max(precision_ratio, 0.0), 1.0))
            
            col_match, col_miss = st.columns(2)
            with col_match:
                with st.expander("✅ Matched Concepts", expanded=True):
                    for skill in metrics.get("matched", []):
                        st.markdown(f"- {skill}")
                        
            with col_miss:
                with st.expander("❌ Missing Concepts", expanded=True):
                    if not metrics.get("missing", []):
                        st.markdown("- None! Perfect Match.")
                    for skill in metrics.get("missing", []):
                        st.markdown(f"- {skill}")
            
            # 3. LLM Recommendations
            st.markdown("### 💡 AI Recommendations")
            for rec in result.get("recommendations", []):
                st.info(f"✨ {rec}")
                    
        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                st.error(f"Backend Error Detail: {e.response.text}")
            else:
                st.error(f"Could not connect to backend. Error: {e}")