#!/usr/bin/env bash
# Script to generate all NATO nation mapper templates

cd "$(dirname "$0")/../keycloak/mapper-templates/nato-nations" || exit 1

# Function to create a nation template
create_template() {
  local name="$1"
  local iso="$2"
  local lang="$3"
  local conv="$4"
  local surname="$5"
  local givenname="$6"
  local email="$7"
  local nationalid="$8"
  local nationalid_desc="$9"
  local filename="${10}"
  
  cat > "$filename" << EOF
{
  "nation": {
    "name": "$name",
    "iso3166": "$iso",
    "language": "$lang",
    "attributeConvention": "$conv"
  },
  "attributes": {
    "profile": {
      "surname": "$surname",
      "givenName": "$givenname",
      "email": "$email"
    },
    "nationalId": {
      "name": "$nationalid",
      "description": "$nationalid_desc"
    }
  },
  "protocolMappers": [
    {
      "name": "family_name",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "$surname",
        "claim.name": "family_name",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "given_name",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "$givenname",
        "claim.name": "given_name",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "email",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "$email",
        "claim.name": "email",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "preferred_username",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-property-mapper",
      "config": {
        "user.attribute": "username",
        "claim.name": "preferred_username",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "countryOfAffiliation",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "countryOfAffiliation",
        "claim.name": "countryOfAffiliation",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "clearance",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "clearance",
        "claim.name": "clearance",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "uniqueID",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "uniqueID",
        "claim.name": "uniqueID",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String"
      }
    },
    {
      "name": "acpCOI",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "acpCOI",
        "claim.name": "acpCOI",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "String",
        "multivalued": "true"
      }
    },
    {
      "name": "nationalId",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "config": {
        "user.attribute": "$nationalid",
        "claim.name": "nationalId",
        "id.token.claim": "false",
        "access.token.claim": "true",
        "userinfo.token.claim": "false",
        "jsonType.label": "String"
      }
    }
  ]
}
EOF
  echo "Created $filename"
}

# Create all nation templates
create_template "Canada" "CAN" "English/French" "Western European" "lastName" "firstName" "email" "socialInsuranceNumber" "Canadian social insurance number" "canada.json"
create_template "Croatia" "HRV" "Croatian" "Eastern European" "prezime" "ime" "email" "oib" "Croatian personal identification number" "croatia.json"
create_template "Czech Republic" "CZE" "Czech" "Eastern European" "příjmení" "jméno" "email" "rodnéČíslo" "Czech birth number" "czechia.json"
create_template "Denmark" "DNK" "Danish" "Nordic" "efternavn" "fornavn" "email" "cprNummer" "Danish CPR number" "denmark.json"
create_template "Estonia" "EST" "Estonian" "Baltic" "perekonnanimi" "eesnimi" "email" "isikukood" "Estonian personal identification code" "estonia.json"
create_template "France" "FRA" "French" "Romance" "nom" "prénom" "courriel" "numéroIdentification" "French national identification number" "france.json"
create_template "Germany" "DEU" "German" "Germanic" "nachname" "vorname" "email" "personalausweis" "German identity card number" "germany.json"
create_template "Greece" "GRC" "Greek" "Southern European" "επώνυμο" "όνομα" "email" "αριθμόςΤαυτότητας" "Greek identity card number" "greece.json"
create_template "Hungary" "HUN" "Hungarian" "Eastern European" "vezetéknév" "keresztnév" "email" "személyazonosító" "Hungarian personal identity number" "hungary.json"
create_template "Iceland" "ISL" "Icelandic" "Nordic" "eftirnafn" "eiginnafn" "netfang" "kennitala" "Icelandic identity number" "iceland.json"
create_template "Italy" "ITA" "Italian" "Romance" "cognome" "nome" "email" "codiceFiscale" "Italian fiscal code" "italy.json"
create_template "Latvia" "LVA" "Latvian" "Baltic" "uzvārds" "vārds" "epasts" "personasKods" "Latvian personal code" "latvia.json"
create_template "Lithuania" "LTU" "Lithuanian" "Baltic" "pavardė" "vardas" "elektroninisPaštas" "asmensKodas" "Lithuanian personal code" "lithuania.json"
create_template "Luxembourg" "LUX" "Luxembourgish/French/German" "Multilingual" "nom" "prénom" "email" "numeroIdentification" "Luxembourg identification number" "luxembourg.json"
create_template "Montenegro" "MNE" "Montenegrin" "Eastern European" "презиме" "име" "email" "jmbg" "Montenegrin unique master citizen number" "montenegro.json"
create_template "Netherlands" "NLD" "Dutch" "Germanic" "achternaam" "voornaam" "email" "burgerservicenummer" "Dutch citizen service number" "netherlands.json"
create_template "North Macedonia" "MKD" "Macedonian" "Eastern European" "презиме" "име" "email" "матичен број" "Macedonian unique master citizen number" "north-macedonia.json"
create_template "Norway" "NOR" "Norwegian" "Nordic" "etternavn" "fornavn" "epost" "fodselsnummer" "Norwegian national identity number" "norway.json"
create_template "Poland" "POL" "Polish" "Eastern European" "nazwisko" "imię" "email" "pesel" "Polish national identification number" "poland.json"
create_template "Portugal" "PRT" "Portuguese" "Romance" "sobrenome" "nome" "email" "numeroIdentificacao" "Portuguese identification card number" "portugal.json"
create_template "Romania" "ROU" "Romanian" "Romance" "nume" "prenume" "email" "coduPersonal" "Romanian personal numerical code" "romania.json"
create_template "Slovakia" "SVK" "Slovak" "Eastern European" "priezvisko" "meno" "email" "rodnéČíslo" "Slovak birth number" "slovakia.json"
create_template "Slovenia" "SVN" "Slovenian" "Eastern European" "priimek" "ime" "email" "emso" "Slovenian unique master citizen number" "slovenia.json"
create_template "Spain" "ESP" "Spanish" "Romance" "apellido" "nombre" "correo" "documentoIdentidad" "Spanish national identity document" "spain.json"
create_template "Turkey" "TUR" "Turkish" "Transcontinental" "soyadı" "adı" "eposta" "tcKimlikNo" "Turkish identity number" "turkey.json"
create_template "United Kingdom" "GBR" "English" "Western European" "surname" "givenName" "email" "ukPersonnelNumber" "UK personnel number" "united-kingdom.json"
create_template "United States" "USA" "English" "Western European" "lastName" "firstName" "email" "socialSecurityNumber" "US social security number" "united-states.json"
create_template "Finland" "FIN" "Finnish" "Nordic" "sukunimi" "etunimi" "sahkoposti" "henkilotunnus" "Finnish personal identity code" "finland.json"
create_template "Sweden" "SWE" "Swedish" "Nordic" "efternamn" "fornamn" "epost" "personnummer" "Swedish personal identity number" "sweden.json"

echo ""
echo "✓ Created all 32 NATO nation mapper templates"
