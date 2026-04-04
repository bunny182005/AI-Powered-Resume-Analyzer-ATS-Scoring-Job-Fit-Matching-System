from typing import Dict, List


def generate_suggestions(
    missing_keywords: List[str],
    ats_diagnostics: Dict,
) -> List[str]:
    suggestions: List[str] = []

    if missing_keywords:
        top_missing = ", ".join(missing_keywords[:10])
        suggestions.append(
            f"Add missing JD keywords naturally in achievements and skills: {top_missing}."
        )

    missing_sections = ats_diagnostics.get("missing_sections", [])
    if missing_sections:
        suggestions.append(
            f"Include missing resume sections: {', '.join(missing_sections)}."
        )

    if ats_diagnostics.get("formatting_issues"):
        suggestions.extend(ats_diagnostics["formatting_issues"])

    action_hits = ats_diagnostics.get("action_verb_hits", 0)
    if action_hits < 8:
        suggestions.append(
            "Increase action-oriented verbs (e.g., developed, implemented, optimized) in work experience."
        )

    contact_issues = ats_diagnostics.get("contact_issues", [])
    suggestions.extend(contact_issues)

    if not suggestions:
        suggestions.append("Resume aligns well with the job description. Tailor metrics per bullet for stronger impact.")

    return list(dict.fromkeys(suggestions))
