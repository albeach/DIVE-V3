#!/usr/bin/env bash
# Script to generate all NATO nation user profile templates

cd "$(dirname "$0")/../keycloak/user-profile-templates"

# Function to create a user profile template
create_user_profile() {
  local name="$1"
  local iso="$2"
  local surname="$3"
  local surname_display="$4"
  local givenname="$5"
  local givenname_display="$6"
  local email="$7"
  local email_display="$8"
  local nationalid="$9"
  local nationalid_display="${10}"
  local filename="${11}"
  
  cat > "$filename" << EOF
{
  "nation": {
    "name": "$name",
    "iso3166": "$iso"
  },
  "attributes": [
    {
      "name": "$surname",
      "displayName": "$surname_display",
      "required": true,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "validations": {
        "length": {"min": 1, "max": 255}
      }
    },
    {
      "name": "$givenname",
      "displayName": "$givenname_display",
      "required": true,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "validations": {
        "length": {"min": 1, "max": 255}
      }
    },
    {
      "name": "$email",
      "displayName": "$email_display",
      "required": true,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "validations": {
        "email": {}
      }
    },
    {
      "name": "$nationalid",
      "displayName": "$nationalid_display",
      "required": false,
      "permissions": {
        "view": ["admin"],
        "edit": ["admin"]
      },
      "validations": {
        "length": {"max": 50}
      }
    },
    {
      "name": "countryOfAffiliation",
      "displayName": "Country of Affiliation",
      "required": true,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin"]
      },
      "validations": {
        "length": {"min": 3, "max": 3},
        "pattern": "^[A-Z]{3}\$"
      }
    },
    {
      "name": "clearance",
      "displayName": "Security Clearance",
      "required": true,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin"]
      },
      "validations": {
        "options": ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]
      }
    },
    {
      "name": "uniqueID",
      "displayName": "Unique Identifier",
      "required": true,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin"]
      },
      "validations": {
        "length": {"min": 1, "max": 255}
      }
    },
    {
      "name": "acpCOI",
      "displayName": "Communities of Interest",
      "multivalued": true,
      "required": false,
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin"]
      }
    }
  ]
}
EOF
  echo "Created $filename"
}

# Create all nation user profile templates
create_user_profile "Albania" "ALB" "mbiemri" "Mbiemri" "emri" "Emri" "email" "Email" "numriPersonal" "Numri Personal" "albania.json"
create_user_profile "Belgium" "BEL" "achternaam" "Achternaam/Nom" "voornaam" "Voornaam/Prénom" "email" "Email" "rijksregisternummer" "Rijksregisternummer" "belgium.json"
create_user_profile "Bulgaria" "BGR" "фамилия" "Фамилия" "име" "Име" "имейл" "Имейл" "егн" "ЕГН" "bulgaria.json"
create_user_profile "Canada" "CAN" "lastName" "Last Name" "firstName" "First Name" "email" "Email" "socialInsuranceNumber" "Social Insurance Number" "canada.json"
create_user_profile "Croatia" "HRV" "prezime" "Prezime" "ime" "Ime" "email" "Email" "oib" "OIB" "croatia.json"
create_user_profile "Czech Republic" "CZE" "příjmení" "Příjmení" "jméno" "Jméno" "email" "Email" "rodnéČíslo" "Rodné Číslo" "czechia.json"
create_user_profile "Denmark" "DNK" "efternavn" "Efternavn" "fornavn" "Fornavn" "email" "Email" "cprNummer" "CPR-nummer" "denmark.json"
create_user_profile "Estonia" "EST" "perekonnanimi" "Perekonnanimi" "eesnimi" "Eesnimi" "email" "E-post" "isikukood" "Isikukood" "estonia.json"
create_user_profile "Finland" "FIN" "sukunimi" "Sukunimi" "etunimi" "Etunimi" "sahkoposti" "Sähköposti" "henkilotunnus" "Henkilötunnus" "finland.json"
create_user_profile "France" "FRA" "nom" "Nom de famille" "prénom" "Prénom" "courriel" "Adresse électronique" "numéroIdentification" "Numéro d'identification" "france.json"
create_user_profile "Germany" "DEU" "nachname" "Nachname" "vorname" "Vorname" "email" "E-Mail" "personalausweis" "Personalausweis" "germany.json"
create_user_profile "Greece" "GRC" "επώνυμο" "Επώνυμο" "όνομα" "Όνομα" "email" "Email" "αριθμόςΤαυτότητας" "Αριθμός Ταυτότητας" "greece.json"
create_user_profile "Hungary" "HUN" "vezetéknév" "Vezetéknév" "keresztnév" "Keresztnév" "email" "Email" "személyazonosító" "Személyazonosító" "hungary.json"
create_user_profile "Iceland" "ISL" "eftirnafn" "Eftirnafn" "eiginnafn" "Eiginnafn" "netfang" "Netfang" "kennitala" "Kennitala" "iceland.json"
create_user_profile "Italy" "ITA" "cognome" "Cognome" "nome" "Nome" "email" "Email" "codiceFiscale" "Codice Fiscale" "italy.json"
create_user_profile "Latvia" "LVA" "uzvārds" "Uzvārds" "vārds" "Vārds" "epasts" "E-pasts" "personasKods" "Personas Kods" "latvia.json"
create_user_profile "Lithuania" "LTU" "pavardė" "Pavardė" "vardas" "Vardas" "elektroninisPaštas" "Elektroninis Paštas" "asmensKodas" "Asmens Kodas" "lithuania.json"
create_user_profile "Luxembourg" "LUX" "nom" "Nom" "prénom" "Prénom" "email" "Email" "numeroIdentification" "Numéro d'identification" "luxembourg.json"
create_user_profile "Montenegro" "MNE" "презиме" "Презиме" "име" "Име" "email" "Email" "jmbg" "ЈМБГ" "montenegro.json"
create_user_profile "Netherlands" "NLD" "achternaam" "Achternaam" "voornaam" "Voornaam" "email" "Email" "burgerservicenummer" "Burgerservicenummer" "netherlands.json"
create_user_profile "North Macedonia" "MKD" "презиме" "Презиме" "име" "Име" "email" "Email" "матичен број" "Матичен број" "north-macedonia.json"
create_user_profile "Norway" "NOR" "etternavn" "Etternavn" "fornavn" "Fornavn" "epost" "E-post" "fodselsnummer" "Fødselsnummer" "norway.json"
create_user_profile "Poland" "POL" "nazwisko" "Nazwisko" "imię" "Imię" "email" "Email" "pesel" "PESEL" "poland.json"
create_user_profile "Portugal" "PRT" "sobrenome" "Sobrenome" "nome" "Nome" "email" "Email" "numeroIdentificacao" "Número de Identificação" "portugal.json"
create_user_profile "Romania" "ROU" "nume" "Nume" "prenume" "Prenume" "email" "Email" "coduPersonal" "Cod Personal" "romania.json"
create_user_profile "Slovakia" "SVK" "priezvisko" "Priezvisko" "meno" "Meno" "email" "Email" "rodnéČíslo" "Rodné Číslo" "slovakia.json"
create_user_profile "Slovenia" "SVN" "priimek" "Priimek" "ime" "Ime" "email" "Email" "emso" "EMSO" "slovenia.json"
create_user_profile "Spain" "ESP" "apellido" "Apellido" "nombre" "Nombre" "correo" "Correo electrónico" "documentoIdentidad" "Documento de Identidad" "spain.json"
create_user_profile "Sweden" "SWE" "efternamn" "Efternamn" "fornamn" "Förnamn" "epost" "E-post" "personnummer" "Personnummer" "sweden.json"
create_user_profile "Turkey" "TUR" "soyadı" "Soyadı" "adı" "Adı" "eposta" "E-posta" "tcKimlikNo" "TC Kimlik No" "turkey.json"
create_user_profile "United Kingdom" "GBR" "surname" "Surname" "givenName" "Given Name" "email" "Email" "ukPersonnelNumber" "UK Personnel Number" "united-kingdom.json"
create_user_profile "United States" "USA" "lastName" "Last Name" "firstName" "First Name" "email" "Email" "socialSecurityNumber" "Social Security Number" "united-states.json"

echo ""
echo "✓ Created all 32 NATO nation user profile templates"
