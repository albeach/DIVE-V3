package dive.authorization

import rego.v1

# ==================================================================================================
# Comprehensive Authorization Test Suite - Phase 3
# ==================================================================================================
# 
# Test Coverage: 160+ tests (4 clearances × 4 classifications × 10 countries)
# 
# Countries: USA, ESP, FRA, GBR, DEU, ITA, NLD, POL, CAN, INDUSTRY
# Clearance Levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
# Classification Levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
#
# Pattern: test_{country}_{clearance}_{classification}_{expected_result}
# 
# Last Updated: October 29, 2025 (Phase 3)
# ==================================================================================================

# ==================================================================================================
# USA Clearance × Classification Tests (16 tests)
# ==================================================================================================

# USA: UNCLASSIFIED clearance
test_usa_unclassified_vs_unclassified_allow if {
    allow with input as usa_test_input("UNCLASSIFIED", "UNCLASSIFIED", "UNCLASSIFIED")
}

test_usa_unclassified_vs_confidential_deny if {
    not allow with input as usa_test_input("UNCLASSIFIED", "UNCLASSIFIED", "CONFIDENTIAL")
}

test_usa_unclassified_vs_secret_deny if {
    not allow with input as usa_test_input("UNCLASSIFIED", "UNCLASSIFIED", "SECRET")
}

test_usa_unclassified_vs_top_secret_deny if {
    not allow with input as usa_test_input("UNCLASSIFIED", "UNCLASSIFIED", "TOP_SECRET")
}

# USA: CONFIDENTIAL clearance
test_usa_confidential_vs_unclassified_allow if {
    allow with input as usa_test_input("CONFIDENTIAL", "CONFIDENTIAL", "UNCLASSIFIED")
}

test_usa_confidential_vs_confidential_allow if {
    allow with input as usa_test_input("CONFIDENTIAL", "CONFIDENTIAL", "CONFIDENTIAL")
}

test_usa_confidential_vs_secret_deny if {
    not allow with input as usa_test_input("CONFIDENTIAL", "CONFIDENTIAL", "SECRET")
}

test_usa_confidential_vs_top_secret_deny if {
    not allow with input as usa_test_input("CONFIDENTIAL", "CONFIDENTIAL", "TOP_SECRET")
}

# USA: SECRET clearance
test_usa_secret_vs_unclassified_allow if {
    allow with input as usa_test_input("SECRET", "SECRET", "UNCLASSIFIED")
}

test_usa_secret_vs_confidential_allow if {
    allow with input as usa_test_input("SECRET", "SECRET", "CONFIDENTIAL")
}

test_usa_secret_vs_secret_allow if {
    allow with input as usa_test_input("SECRET", "SECRET", "SECRET")
}

test_usa_secret_vs_top_secret_deny if {
    not allow with input as usa_test_input("SECRET", "SECRET", "TOP_SECRET")
}

# USA: TOP_SECRET clearance
test_usa_top_secret_vs_unclassified_allow if {
    allow with input as usa_test_input("TOP_SECRET", "TOP SECRET", "UNCLASSIFIED")
}

test_usa_top_secret_vs_confidential_allow if {
    allow with input as usa_test_input("TOP_SECRET", "TOP SECRET", "CONFIDENTIAL")
}

test_usa_top_secret_vs_secret_allow if {
    allow with input as usa_test_input("TOP_SECRET", "TOP SECRET", "SECRET")
}

test_usa_top_secret_vs_top_secret_allow if {
    allow with input as usa_test_input("TOP_SECRET", "TOP SECRET", "TOP_SECRET")
}

# ==================================================================================================
# Spain (ESP) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# ESP: NO CLASIFICADO (UNCLASSIFIED)
test_esp_no_clasificado_vs_unclassified_allow if {
    allow with input as esp_test_input("UNCLASSIFIED", "NO CLASIFICADO", "UNCLASSIFIED")
}

test_esp_no_clasificado_vs_confidential_deny if {
    not allow with input as esp_test_input("UNCLASSIFIED", "NO CLASIFICADO", "CONFIDENTIAL")
}

test_esp_no_clasificado_vs_secret_deny if {
    not allow with input as esp_test_input("UNCLASSIFIED", "NO CLASIFICADO", "SECRET")
}

test_esp_no_clasificado_vs_top_secret_deny if {
    not allow with input as esp_test_input("UNCLASSIFIED", "NO CLASIFICADO", "TOP_SECRET")
}

# ESP: CONFIDENCIAL
test_esp_confidencial_vs_unclassified_allow if {
    allow with input as esp_test_input("CONFIDENTIAL", "CONFIDENCIAL", "UNCLASSIFIED")
}

test_esp_confidencial_vs_confidential_allow if {
    allow with input as esp_test_input("CONFIDENTIAL", "CONFIDENCIAL", "CONFIDENTIAL")
}

test_esp_confidencial_vs_secret_deny if {
    not allow with input as esp_test_input("CONFIDENTIAL", "CONFIDENCIAL", "SECRET")
}

test_esp_confidencial_vs_top_secret_deny if {
    not allow with input as esp_test_input("CONFIDENTIAL", "CONFIDENCIAL", "TOP_SECRET")
}

# ESP: SECRETO
test_esp_secreto_vs_unclassified_allow if {
    allow with input as esp_test_input("SECRET", "SECRETO", "UNCLASSIFIED")
}

test_esp_secreto_vs_confidential_allow if {
    allow with input as esp_test_input("SECRET", "SECRETO", "CONFIDENTIAL")
}

test_esp_secreto_vs_secret_allow if {
    allow with input as esp_test_input("SECRET", "SECRETO", "SECRET")
}

test_esp_secreto_vs_top_secret_deny if {
    not allow with input as esp_test_input("SECRET", "SECRETO", "TOP_SECRET")
}

# ESP: ALTO SECRETO
test_esp_alto_secreto_vs_unclassified_allow if {
    allow with input as esp_test_input("TOP_SECRET", "ALTO SECRETO", "UNCLASSIFIED")
}

test_esp_alto_secreto_vs_confidential_allow if {
    allow with input as esp_test_input("TOP_SECRET", "ALTO SECRETO", "CONFIDENTIAL")
}

test_esp_alto_secreto_vs_secret_allow if {
    allow with input as esp_test_input("TOP_SECRET", "ALTO SECRETO", "SECRET")
}

test_esp_alto_secreto_vs_top_secret_allow if {
    allow with input as esp_test_input("TOP_SECRET", "ALTO SECRETO", "TOP_SECRET")
}

# ==================================================================================================
# France (FRA) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# FRA: NON CLASSIFIÉ (UNCLASSIFIED)
test_fra_non_classifie_vs_unclassified_allow if {
    allow with input as fra_test_input("UNCLASSIFIED", "NON CLASSIFIÉ", "UNCLASSIFIED")
}

test_fra_non_classifie_vs_confidential_deny if {
    not allow with input as fra_test_input("UNCLASSIFIED", "NON CLASSIFIÉ", "CONFIDENTIAL")
}

test_fra_non_classifie_vs_secret_deny if {
    not allow with input as fra_test_input("UNCLASSIFIED", "NON CLASSIFIÉ", "SECRET")
}

test_fra_non_classifie_vs_top_secret_deny if {
    not allow with input as fra_test_input("UNCLASSIFIED", "NON CLASSIFIÉ", "TOP_SECRET")
}

# FRA: CONFIDENTIEL DÉFENSE
test_fra_confidentiel_defense_vs_unclassified_allow if {
    allow with input as fra_test_input("CONFIDENTIAL", "CONFIDENTIEL DÉFENSE", "UNCLASSIFIED")
}

test_fra_confidentiel_defense_vs_confidential_allow if {
    allow with input as fra_test_input("CONFIDENTIAL", "CONFIDENTIEL DÉFENSE", "CONFIDENTIAL")
}

test_fra_confidentiel_defense_vs_secret_deny if {
    not allow with input as fra_test_input("CONFIDENTIAL", "CONFIDENTIEL DÉFENSE", "SECRET")
}

test_fra_confidentiel_defense_vs_top_secret_deny if {
    not allow with input as fra_test_input("CONFIDENTIAL", "CONFIDENTIEL DÉFENSE", "TOP_SECRET")
}

# FRA: SECRET DÉFENSE
test_fra_secret_defense_vs_unclassified_allow if {
    allow with input as fra_test_input("SECRET", "SECRET DÉFENSE", "UNCLASSIFIED")
}

test_fra_secret_defense_vs_confidential_allow if {
    allow with input as fra_test_input("SECRET", "SECRET DÉFENSE", "CONFIDENTIAL")
}

test_fra_secret_defense_vs_secret_allow if {
    allow with input as fra_test_input("SECRET", "SECRET DÉFENSE", "SECRET")
}

test_fra_secret_defense_vs_top_secret_deny if {
    not allow with input as fra_test_input("SECRET", "SECRET DÉFENSE", "TOP_SECRET")
}

# FRA: TRÈS SECRET DÉFENSE
test_fra_tres_secret_defense_vs_unclassified_allow if {
    allow with input as fra_test_input("TOP_SECRET", "TRÈS SECRET DÉFENSE", "UNCLASSIFIED")
}

test_fra_tres_secret_defense_vs_confidential_allow if {
    allow with input as fra_test_input("TOP_SECRET", "TRÈS SECRET DÉFENSE", "CONFIDENTIAL")
}

test_fra_tres_secret_defense_vs_secret_allow if {
    allow with input as fra_test_input("TOP_SECRET", "TRÈS SECRET DÉFENSE", "SECRET")
}

test_fra_tres_secret_defense_vs_top_secret_allow if {
    allow with input as fra_test_input("TOP_SECRET", "TRÈS SECRET DÉFENSE", "TOP_SECRET")
}

# ==================================================================================================
# UK (GBR) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# GBR: OFFICIAL (UNCLASSIFIED)
test_gbr_official_vs_unclassified_allow if {
    allow with input as gbr_test_input("UNCLASSIFIED", "OFFICIAL", "UNCLASSIFIED")
}

test_gbr_official_vs_confidential_deny if {
    not allow with input as gbr_test_input("UNCLASSIFIED", "OFFICIAL", "CONFIDENTIAL")
}

test_gbr_official_vs_secret_deny if {
    not allow with input as gbr_test_input("UNCLASSIFIED", "OFFICIAL", "SECRET")
}

test_gbr_official_vs_top_secret_deny if {
    not allow with input as gbr_test_input("UNCLASSIFIED", "OFFICIAL", "TOP_SECRET")
}

# GBR: CONFIDENTIAL
test_gbr_confidential_vs_unclassified_allow if {
    allow with input as gbr_test_input("CONFIDENTIAL", "CONFIDENTIAL", "UNCLASSIFIED")
}

test_gbr_confidential_vs_confidential_allow if {
    allow with input as gbr_test_input("CONFIDENTIAL", "CONFIDENTIAL", "CONFIDENTIAL")
}

test_gbr_confidential_vs_secret_deny if {
    not allow with input as gbr_test_input("CONFIDENTIAL", "CONFIDENTIAL", "SECRET")
}

test_gbr_confidential_vs_top_secret_deny if {
    not allow with input as gbr_test_input("CONFIDENTIAL", "CONFIDENTIAL", "TOP_SECRET")
}

# GBR: SECRET
test_gbr_secret_vs_unclassified_allow if {
    allow with input as gbr_test_input("SECRET", "SECRET", "UNCLASSIFIED")
}

test_gbr_secret_vs_confidential_allow if {
    allow with input as gbr_test_input("SECRET", "SECRET", "CONFIDENTIAL")
}

test_gbr_secret_vs_secret_allow if {
    allow with input as gbr_test_input("SECRET", "SECRET", "SECRET")
}

test_gbr_secret_vs_top_secret_deny if {
    not allow with input as gbr_test_input("SECRET", "SECRET", "TOP_SECRET")
}

# GBR: TOP SECRET
test_gbr_top_secret_vs_unclassified_allow if {
    allow with input as gbr_test_input("TOP_SECRET", "TOP SECRET", "UNCLASSIFIED")
}

test_gbr_top_secret_vs_confidential_allow if {
    allow with input as gbr_test_input("TOP_SECRET", "TOP SECRET", "CONFIDENTIAL")
}

test_gbr_top_secret_vs_secret_allow if {
    allow with input as gbr_test_input("TOP_SECRET", "TOP SECRET", "SECRET")
}

test_gbr_top_secret_vs_top_secret_allow if {
    allow with input as gbr_test_input("TOP_SECRET", "TOP SECRET", "TOP_SECRET")
}

# ==================================================================================================
# Germany (DEU) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# DEU: OFFEN (UNCLASSIFIED)
test_deu_offen_vs_unclassified_allow if {
    allow with input as deu_test_input("UNCLASSIFIED", "OFFEN", "UNCLASSIFIED")
}

test_deu_offen_vs_confidential_deny if {
    not allow with input as deu_test_input("UNCLASSIFIED", "OFFEN", "CONFIDENTIAL")
}

test_deu_offen_vs_secret_deny if {
    not allow with input as deu_test_input("UNCLASSIFIED", "OFFEN", "SECRET")
}

test_deu_offen_vs_top_secret_deny if {
    not allow with input as deu_test_input("UNCLASSIFIED", "OFFEN", "TOP_SECRET")
}

# DEU: VS-VERTRAULICH (CONFIDENTIAL)
test_deu_vs_vertraulich_vs_unclassified_allow if {
    allow with input as deu_test_input("CONFIDENTIAL", "VS-VERTRAULICH", "UNCLASSIFIED")
}

test_deu_vs_vertraulich_vs_confidential_allow if {
    allow with input as deu_test_input("CONFIDENTIAL", "VS-VERTRAULICH", "CONFIDENTIAL")
}

test_deu_vs_vertraulich_vs_secret_deny if {
    not allow with input as deu_test_input("CONFIDENTIAL", "VS-VERTRAULICH", "SECRET")
}

test_deu_vs_vertraulich_vs_top_secret_deny if {
    not allow with input as deu_test_input("CONFIDENTIAL", "VS-VERTRAULICH", "TOP_SECRET")
}

# DEU: GEHEIM (SECRET)
test_deu_geheim_vs_unclassified_allow if {
    allow with input as deu_test_input("SECRET", "GEHEIM", "UNCLASSIFIED")
}

test_deu_geheim_vs_confidential_allow if {
    allow with input as deu_test_input("SECRET", "GEHEIM", "CONFIDENTIAL")
}

test_deu_geheim_vs_secret_allow if {
    allow with input as deu_test_input("SECRET", "GEHEIM", "SECRET")
}

test_deu_geheim_vs_top_secret_deny if {
    not allow with input as deu_test_input("SECRET", "GEHEIM", "TOP_SECRET")
}

# DEU: STRENG GEHEIM (TOP_SECRET)
test_deu_streng_geheim_vs_unclassified_allow if {
    allow with input as deu_test_input("TOP_SECRET", "STRENG GEHEIM", "UNCLASSIFIED")
}

test_deu_streng_geheim_vs_confidential_allow if {
    allow with input as deu_test_input("TOP_SECRET", "STRENG GEHEIM", "CONFIDENTIAL")
}

test_deu_streng_geheim_vs_secret_allow if {
    allow with input as deu_test_input("TOP_SECRET", "STRENG GEHEIM", "SECRET")
}

test_deu_streng_geheim_vs_top_secret_allow if {
    allow with input as deu_test_input("TOP_SECRET", "STRENG GEHEIM", "TOP_SECRET")
}

# ==================================================================================================
# Italy (ITA) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# ITA: NON CLASSIFICATO (UNCLASSIFIED)
test_ita_non_classificato_vs_unclassified_allow if {
    allow with input as ita_test_input("UNCLASSIFIED", "NON CLASSIFICATO", "UNCLASSIFIED")
}

test_ita_non_classificato_vs_confidential_deny if {
    not allow with input as ita_test_input("UNCLASSIFIED", "NON CLASSIFICATO", "CONFIDENTIAL")
}

test_ita_non_classificato_vs_secret_deny if {
    not allow with input as ita_test_input("UNCLASSIFIED", "NON CLASSIFICATO", "SECRET")
}

test_ita_non_classificato_vs_top_secret_deny if {
    not allow with input as ita_test_input("UNCLASSIFIED", "NON CLASSIFICATO", "TOP_SECRET")
}

# ITA: CONFIDENZIALE (CONFIDENTIAL)
test_ita_riservato_vs_unclassified_allow if {
    allow with input as ita_test_input("CONFIDENTIAL", "CONFIDENZIALE", "UNCLASSIFIED")
}

test_ita_riservato_vs_confidential_allow if {
    allow with input as ita_test_input("CONFIDENTIAL", "CONFIDENZIALE", "CONFIDENTIAL")
}

test_ita_riservato_vs_secret_deny if {
    not allow with input as ita_test_input("CONFIDENTIAL", "CONFIDENZIALE", "SECRET")
}

test_ita_riservato_vs_top_secret_deny if {
    not allow with input as ita_test_input("CONFIDENTIAL", "CONFIDENZIALE", "TOP_SECRET")
}

# ITA: SEGRETO (SECRET)
test_ita_segreto_vs_unclassified_allow if {
    allow with input as ita_test_input("SECRET", "SEGRETO", "UNCLASSIFIED")
}

test_ita_segreto_vs_confidential_allow if {
    allow with input as ita_test_input("SECRET", "SEGRETO", "CONFIDENTIAL")
}

test_ita_segreto_vs_secret_allow if {
    allow with input as ita_test_input("SECRET", "SEGRETO", "SECRET")
}

test_ita_segreto_vs_top_secret_deny if {
    not allow with input as ita_test_input("SECRET", "SEGRETO", "TOP_SECRET")
}

# ITA: SEGRETISSIMO (TOP_SECRET)
test_ita_segretissimo_vs_unclassified_allow if {
    allow with input as ita_test_input("TOP_SECRET", "SEGRETISSIMO", "UNCLASSIFIED")
}

test_ita_segretissimo_vs_confidential_allow if {
    allow with input as ita_test_input("TOP_SECRET", "SEGRETISSIMO", "CONFIDENTIAL")
}

test_ita_segretissimo_vs_secret_allow if {
    allow with input as ita_test_input("TOP_SECRET", "SEGRETISSIMO", "SECRET")
}

test_ita_segretissimo_vs_top_secret_allow if {
    allow with input as ita_test_input("TOP_SECRET", "SEGRETISSIMO", "TOP_SECRET")
}

# ==================================================================================================
# Netherlands (NLD) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# NLD: NIET GERUBRICEERD (UNCLASSIFIED)
test_nld_niet_gerubriceerd_vs_unclassified_allow if {
    allow with input as nld_test_input("UNCLASSIFIED", "NIET GERUBRICEERD", "UNCLASSIFIED")
}

test_nld_niet_gerubriceerd_vs_confidential_deny if {
    not allow with input as nld_test_input("UNCLASSIFIED", "NIET GERUBRICEERD", "CONFIDENTIAL")
}

test_nld_niet_gerubriceerd_vs_secret_deny if {
    not allow with input as nld_test_input("UNCLASSIFIED", "NIET GERUBRICEERD", "SECRET")
}

test_nld_niet_gerubriceerd_vs_top_secret_deny if {
    not allow with input as nld_test_input("UNCLASSIFIED", "NIET GERUBRICEERD", "TOP_SECRET")
}

# NLD: CONFIDENTIEEL (CONFIDENTIAL)
test_nld_vertrouwelijk_vs_unclassified_allow if {
    allow with input as nld_test_input("CONFIDENTIAL", "CONFIDENTIEEL", "UNCLASSIFIED")
}

test_nld_vertrouwelijk_vs_confidential_allow if {
    allow with input as nld_test_input("CONFIDENTIAL", "CONFIDENTIEEL", "CONFIDENTIAL")
}

test_nld_vertrouwelijk_vs_secret_deny if {
    not allow with input as nld_test_input("CONFIDENTIAL", "CONFIDENTIEEL", "SECRET")
}

test_nld_vertrouwelijk_vs_top_secret_deny if {
    not allow with input as nld_test_input("CONFIDENTIAL", "CONFIDENTIEEL", "TOP_SECRET")
}

# NLD: GEHEIM (SECRET)
test_nld_geheim_vs_unclassified_allow if {
    allow with input as nld_test_input("SECRET", "GEHEIM", "UNCLASSIFIED")
}

test_nld_geheim_vs_confidential_allow if {
    allow with input as nld_test_input("SECRET", "GEHEIM", "CONFIDENTIAL")
}

test_nld_geheim_vs_secret_allow if {
    allow with input as nld_test_input("SECRET", "GEHEIM", "SECRET")
}

test_nld_geheim_vs_top_secret_deny if {
    not allow with input as nld_test_input("SECRET", "GEHEIM", "TOP_SECRET")
}

# NLD: ZEER GEHEIM (TOP_SECRET)
test_nld_zeer_geheim_vs_unclassified_allow if {
    allow with input as nld_test_input("TOP_SECRET", "ZEER GEHEIM", "UNCLASSIFIED")
}

test_nld_zeer_geheim_vs_confidential_allow if {
    allow with input as nld_test_input("TOP_SECRET", "ZEER GEHEIM", "CONFIDENTIAL")
}

test_nld_zeer_geheim_vs_secret_allow if {
    allow with input as nld_test_input("TOP_SECRET", "ZEER GEHEIM", "SECRET")
}

test_nld_zeer_geheim_vs_top_secret_allow if {
    allow with input as nld_test_input("TOP_SECRET", "ZEER GEHEIM", "TOP_SECRET")
}

# ==================================================================================================
# Poland (POL) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# POL: NIEJAWNE (UNCLASSIFIED)
test_pol_jawny_vs_unclassified_allow if {
    allow with input as pol_test_input("UNCLASSIFIED", "NIEJAWNE", "UNCLASSIFIED")
}

test_pol_jawny_vs_confidential_deny if {
    not allow with input as pol_test_input("UNCLASSIFIED", "NIEJAWNE", "CONFIDENTIAL")
}

test_pol_jawny_vs_secret_deny if {
    not allow with input as pol_test_input("UNCLASSIFIED", "NIEJAWNE", "SECRET")
}

test_pol_jawny_vs_top_secret_deny if {
    not allow with input as pol_test_input("UNCLASSIFIED", "NIEJAWNE", "TOP_SECRET")
}

# POL: POUFNE (CONFIDENTIAL)
test_pol_poufne_vs_unclassified_allow if {
    allow with input as pol_test_input("CONFIDENTIAL", "POUFNE", "UNCLASSIFIED")
}

test_pol_poufne_vs_confidential_allow if {
    allow with input as pol_test_input("CONFIDENTIAL", "POUFNE", "CONFIDENTIAL")
}

test_pol_poufne_vs_secret_deny if {
    not allow with input as pol_test_input("CONFIDENTIAL", "POUFNE", "SECRET")
}

test_pol_poufne_vs_top_secret_deny if {
    not allow with input as pol_test_input("CONFIDENTIAL", "POUFNE", "TOP_SECRET")
}

# POL: TAJNE (SECRET)
test_pol_tajne_vs_unclassified_allow if {
    allow with input as pol_test_input("SECRET", "TAJNE", "UNCLASSIFIED")
}

test_pol_tajne_vs_confidential_allow if {
    allow with input as pol_test_input("SECRET", "TAJNE", "CONFIDENTIAL")
}

test_pol_tajne_vs_secret_allow if {
    allow with input as pol_test_input("SECRET", "TAJNE", "SECRET")
}

test_pol_tajne_vs_top_secret_deny if {
    not allow with input as pol_test_input("SECRET", "TAJNE", "TOP_SECRET")
}

# POL: ŚCIŚLE TAJNE (TOP_SECRET)
test_pol_scisle_tajne_vs_unclassified_allow if {
    allow with input as pol_test_input("TOP_SECRET", "ŚCIŚLE TAJNE", "UNCLASSIFIED")
}

test_pol_scisle_tajne_vs_confidential_allow if {
    allow with input as pol_test_input("TOP_SECRET", "ŚCIŚLE TAJNE", "CONFIDENTIAL")
}

test_pol_scisle_tajne_vs_secret_allow if {
    allow with input as pol_test_input("TOP_SECRET", "ŚCIŚLE TAJNE", "SECRET")
}

test_pol_scisle_tajne_vs_top_secret_allow if {
    allow with input as pol_test_input("TOP_SECRET", "ŚCIŚLE TAJNE", "TOP_SECRET")
}

# ==================================================================================================
# Canada (CAN) Clearance × Classification Tests (16 tests)
# ==================================================================================================

# CAN: UNCLASSIFIED
test_can_unclassified_vs_unclassified_allow if {
    allow with input as can_test_input("UNCLASSIFIED", "UNCLASSIFIED", "UNCLASSIFIED")
}

test_can_unclassified_vs_confidential_deny if {
    not allow with input as can_test_input("UNCLASSIFIED", "UNCLASSIFIED", "CONFIDENTIAL")
}

test_can_unclassified_vs_secret_deny if {
    not allow with input as can_test_input("UNCLASSIFIED", "UNCLASSIFIED", "SECRET")
}

test_can_unclassified_vs_top_secret_deny if {
    not allow with input as can_test_input("UNCLASSIFIED", "UNCLASSIFIED", "TOP_SECRET")
}

# CAN: CONFIDENTIAL (use standard name from equivalency table)
test_can_protected_b_vs_unclassified_allow if {
    allow with input as can_test_input("CONFIDENTIAL", "CONFIDENTIAL", "UNCLASSIFIED")
}

test_can_protected_b_vs_confidential_allow if {
    allow with input as can_test_input("CONFIDENTIAL", "CONFIDENTIAL", "CONFIDENTIAL")
}

test_can_protected_b_vs_secret_deny if {
    not allow with input as can_test_input("CONFIDENTIAL", "CONFIDENTIAL", "SECRET")
}

test_can_protected_b_vs_top_secret_deny if {
    not allow with input as can_test_input("CONFIDENTIAL", "CONFIDENTIAL", "TOP_SECRET")
}

# CAN: SECRET
test_can_secret_vs_unclassified_allow if {
    allow with input as can_test_input("SECRET", "SECRET", "UNCLASSIFIED")
}

test_can_secret_vs_confidential_allow if {
    allow with input as can_test_input("SECRET", "SECRET", "CONFIDENTIAL")
}

test_can_secret_vs_secret_allow if {
    allow with input as can_test_input("SECRET", "SECRET", "SECRET")
}

test_can_secret_vs_top_secret_deny if {
    not allow with input as can_test_input("SECRET", "SECRET", "TOP_SECRET")
}

# CAN: TOP SECRET
test_can_top_secret_vs_unclassified_allow if {
    allow with input as can_test_input("TOP_SECRET", "TOP SECRET", "UNCLASSIFIED")
}

test_can_top_secret_vs_confidential_allow if {
    allow with input as can_test_input("TOP_SECRET", "TOP SECRET", "CONFIDENTIAL")
}

test_can_top_secret_vs_secret_allow if {
    allow with input as can_test_input("TOP_SECRET", "TOP SECRET", "SECRET")
}

test_can_top_secret_vs_top_secret_allow if {
    allow with input as can_test_input("TOP_SECRET", "TOP SECRET", "TOP_SECRET")
}

# ==================================================================================================
# Industry Clearance × Classification Tests (16 tests)
# ==================================================================================================

# INDUSTRY: PUBLIC (UNCLASSIFIED)
test_industry_public_vs_unclassified_allow if {
    allow with input as industry_test_input("UNCLASSIFIED", "UNCLASSIFIED", "UNCLASSIFIED")
}

test_industry_public_vs_confidential_deny if {
    not allow with input as industry_test_input("UNCLASSIFIED", "UNCLASSIFIED", "CONFIDENTIAL")
}

test_industry_public_vs_secret_deny if {
    not allow with input as industry_test_input("UNCLASSIFIED", "UNCLASSIFIED", "SECRET")
}

test_industry_public_vs_top_secret_deny if {
    not allow with input as industry_test_input("UNCLASSIFIED", "UNCLASSIFIED", "TOP_SECRET")
}

# INDUSTRY: PROPRIETARY (CONFIDENTIAL)
test_industry_proprietary_vs_unclassified_allow if {
    allow with input as industry_test_input("CONFIDENTIAL", "CONFIDENTIAL", "UNCLASSIFIED")
}

test_industry_proprietary_vs_confidential_allow if {
    allow with input as industry_test_input("CONFIDENTIAL", "CONFIDENTIAL", "CONFIDENTIAL")
}

test_industry_proprietary_vs_secret_deny if {
    not allow with input as industry_test_input("CONFIDENTIAL", "CONFIDENTIAL", "SECRET")
}

test_industry_proprietary_vs_top_secret_deny if {
    not allow with input as industry_test_input("CONFIDENTIAL", "CONFIDENTIAL", "TOP_SECRET")
}

# INDUSTRY: TRADE SECRET (SECRET)
test_industry_trade_secret_vs_unclassified_allow if {
    allow with input as industry_test_input("SECRET", "SECRET", "UNCLASSIFIED")
}

test_industry_trade_secret_vs_confidential_allow if {
    allow with input as industry_test_input("SECRET", "SECRET", "CONFIDENTIAL")
}

test_industry_trade_secret_vs_secret_allow if {
    allow with input as industry_test_input("SECRET", "SECRET", "SECRET")
}

test_industry_trade_secret_vs_top_secret_deny if {
    not allow with input as industry_test_input("SECRET", "SECRET", "TOP_SECRET")
}

# INDUSTRY: HIGHLY SENSITIVE (TOP_SECRET)
test_industry_highly_sensitive_vs_unclassified_allow if {
    allow with input as industry_test_input("TOP_SECRET", "TOP SECRET", "UNCLASSIFIED")
}

test_industry_highly_sensitive_vs_confidential_allow if {
    allow with input as industry_test_input("TOP_SECRET", "TOP SECRET", "CONFIDENTIAL")
}

test_industry_highly_sensitive_vs_secret_allow if {
    allow with input as industry_test_input("TOP_SECRET", "TOP SECRET", "SECRET")
}

test_industry_highly_sensitive_vs_top_secret_allow if {
    allow with input as industry_test_input("TOP_SECRET", "TOP SECRET", "TOP_SECRET")
}

# ==================================================================================================
# USA (second set) - Additional USA-specific scenarios (4 tests)
# ==================================================================================================

# USA-specific multi-country releasability
test_usa_multi_country_releasability if {
    allow with input as {
        "subject": {
            "uniqueID": "alice.general@af.mil",
            "clearance": "TOP_SECRET",
            "clearanceOriginal": "TOP SECRET",
            "clearanceCountry": "USA",
            "countryOfAffiliation": "USA",
            "authenticated": true,
            "acpCOI": ["FVEY"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-multi-1",
            "classification": "SECRET",
            "originalClassification": "SECRET",
            "originalCountry": "USA",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-29T12:00:00Z",
            "requestId": "req-usa-1"
        }
    }
}

# ==================================================================================================
# Helper Functions - Generate Test Inputs
# ==================================================================================================

# USA test input builder
usa_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.user@af.mil",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "USA",
        "countryOfAffiliation": "USA",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-usa-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": resource_classification,
        "originalCountry": "USA",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["USA"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-usa-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Spain test input builder
esp_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.usuario@mil.es",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "ESP",
        "countryOfAffiliation": "ESP",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-esp-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_esp_classification(resource_classification),
        "originalCountry": "ESP",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["ESP"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-esp-%s-%s", [normalized_clearance, resource_classification])
    }
}

# France test input builder
fra_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.utilisateur@defense.gouv.fr",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "FRA",
        "countryOfAffiliation": "FRA",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-fra-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_fra_classification(resource_classification),
        "originalCountry": "FRA",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["FRA"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-fra-%s-%s", [normalized_clearance, resource_classification])
    }
}

# UK test input builder
gbr_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.user@mod.uk",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "GBR",
        "countryOfAffiliation": "GBR",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-gbr-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": resource_classification,
        "originalCountry": "GBR",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["GBR"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-gbr-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Germany test input builder
deu_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.benutzer@bundeswehr.org",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "DEU",
        "countryOfAffiliation": "DEU",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-deu-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_deu_classification(resource_classification),
        "originalCountry": "DEU",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["DEU"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-deu-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Italy test input builder
ita_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.utente@difesa.it",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "ITA",
        "countryOfAffiliation": "ITA",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-ita-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_ita_classification(resource_classification),
        "originalCountry": "ITA",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["ITA"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-ita-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Netherlands test input builder
nld_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.gebruiker@defensie.nl",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "NLD",
        "countryOfAffiliation": "NLD",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-nld-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_nld_classification(resource_classification),
        "originalCountry": "NLD",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["NLD"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-nld-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Poland test input builder
pol_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.uzytkownik@mon.gov.pl",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "POL",
        "countryOfAffiliation": "POL",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-pol-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_pol_classification(resource_classification),
        "originalCountry": "POL",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["POL"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-pol-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Canada test input builder
can_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.user@forces.gc.ca",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "CAN",
        "countryOfAffiliation": "CAN",
        "authenticated": true,
        "acpCOI": ["NATO-COSMIC"],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-can-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": _get_can_classification(resource_classification),
        "originalCountry": "CAN",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["CAN"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-can-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Industry test input builder
industry_test_input(normalized_clearance, original_clearance, resource_classification) := {
    "subject": {
        "uniqueID": "test.contractor@lockheed.com",
        "clearance": normalized_clearance,
        "clearanceOriginal": original_clearance,
        "clearanceCountry": "USA",
        "countryOfAffiliation": "USA",  # Industry users affiliated with USA
        "authenticated": true,
        "acpCOI": [],
        "aal": _get_aal_for_clearance(normalized_clearance),
        "amr": _get_amr_for_clearance(normalized_clearance)
    },
    "resource": {
        "resourceId": sprintf("test-industry-%s-%s", [normalized_clearance, resource_classification]),
        "classification": resource_classification,
        "originalClassification": resource_classification,
        "originalCountry": "USA",
        "natoEquivalent": _get_nato_equivalent(resource_classification),
        "releasabilityTo": ["USA"],
        "COI": [],
        "creationDate": "2024-01-01T00:00:00Z",
        "encrypted": false
    },
    "action": {"type": "read"},
    "context": {
        "currentTime": "2025-10-29T12:00:00Z",
        "requestId": sprintf("req-industry-%s-%s", [normalized_clearance, resource_classification])
    }
}

# Helper: Get AAL for clearance level (UNCLASSIFIED = AAL1, all others = AAL2)
_get_aal_for_clearance(clearance) := 1 if {
    clearance == "UNCLASSIFIED"
} else := 2

# Helper: Get AMR for clearance level
_get_amr_for_clearance(clearance) := ["pwd"] if {
    clearance == "UNCLASSIFIED"
} else := ["pwd", "otp"]

# Helper: Get NATO equivalent for classification level
_get_nato_equivalent(classification) := "UNCLASSIFIED" if {
    classification == "UNCLASSIFIED"
} else := "CONFIDENTIAL" if {
    classification == "CONFIDENTIAL"
} else := "SECRET" if {
    classification == "SECRET"
} else := "COSMIC_TOP_SECRET" if {
    classification == "TOP_SECRET"
} else := "UNCLASSIFIED"  # Default fallback

# Helper: Get Spanish classification for normalized level
_get_esp_classification(normalized) := "NO CLASIFICADO" if {
    normalized == "UNCLASSIFIED"
} else := "CONFIDENCIAL" if {
    normalized == "CONFIDENTIAL"
} else := "SECRETO" if {
    normalized == "SECRET"
} else := "ALTO SECRETO" if {
    normalized == "TOP_SECRET"
} else := "NO CLASIFICADO"

# Helper: Get French classification for normalized level
_get_fra_classification(normalized) := "NON CLASSIFIÉ" if {
    normalized == "UNCLASSIFIED"
} else := "CONFIDENTIEL DÉFENSE" if {
    normalized == "CONFIDENTIAL"
} else := "SECRET DÉFENSE" if {
    normalized == "SECRET"
} else := "TRÈS SECRET DÉFENSE" if {
    normalized == "TOP_SECRET"
} else := "NON CLASSIFIÉ"

# Helper: Get German classification for normalized level
_get_deu_classification(normalized) := "OFFEN" if {
    normalized == "UNCLASSIFIED"
} else := "VS-VERTRAULICH" if {
    normalized == "CONFIDENTIAL"
} else := "GEHEIM" if {
    normalized == "SECRET"
} else := "STRENG GEHEIM" if {
    normalized == "TOP_SECRET"
} else := "OFFEN"

# Helper: Get Italian classification for normalized level
_get_ita_classification(normalized) := "NON CLASSIFICATO" if {
    normalized == "UNCLASSIFIED"
} else := "CONFIDENZIALE" if {
    normalized == "CONFIDENTIAL"
} else := "SEGRETO" if {
    normalized == "SECRET"
} else := "SEGRETISSIMO" if {
    normalized == "TOP_SECRET"
} else := "NON CLASSIFICATO"

# Helper: Get Dutch classification for normalized level
_get_nld_classification(normalized) := "NIET GERUBRICEERD" if {
    normalized == "UNCLASSIFIED"
} else := "CONFIDENTIEEL" if {
    normalized == "CONFIDENTIAL"
} else := "GEHEIM" if {
    normalized == "SECRET"
} else := "ZEER GEHEIM" if {
    normalized == "TOP_SECRET"
} else := "NIET GERUBRICEERD"

# Helper: Get Polish classification for normalized level
_get_pol_classification(normalized) := "NIEJAWNE" if {
    normalized == "UNCLASSIFIED"
} else := "POUFNE" if {
    normalized == "CONFIDENTIAL"
} else := "TAJNE" if {
    normalized == "SECRET"
} else := "ŚCIŚLE TAJNE" if {
    normalized == "TOP_SECRET"
} else := "NIEJAWNE"

# Helper: Get Canadian classification for normalized level
_get_can_classification(normalized) := "UNCLASSIFIED" if {
    normalized == "UNCLASSIFIED"
} else := "CONFIDENTIAL" if {
    normalized == "CONFIDENTIAL"
} else := "SECRET" if {
    normalized == "SECRET"
} else := "TOP SECRET" if {
    normalized == "TOP_SECRET"
} else := "UNCLASSIFIED"

