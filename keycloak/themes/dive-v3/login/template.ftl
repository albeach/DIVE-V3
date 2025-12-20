<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false displayWide=false showAnotherWayIfPresent=true>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">

<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>

    <!-- Import Map for WebAuthn (rfc4648 module resolution) -->
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>

    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>

    <!-- DIVE V3 Custom Styles -->
    <link href="${url.resourcesPath}/css/dive-v3.css" rel="stylesheet" />

    <#-- ============================================ -->
    <#-- Detect HOST INSTANCE (before body for data attribute) -->
    <#-- ============================================ -->
    <#-- Complete NATO 32-country detection with ISO 3166-1 alpha-3 codes -->
    <#assign hostInstance = "">
    <#assign hostFlag = "🌐">
    <#assign hostCountryName = "">

    <#-- Parse from realm displayName (e.g., "France", "Germany", "United States") -->
    <#-- Also check for realm name containing ISO code (e.g., "dive-v3-broker-alb") -->
    <#if realm?? && (realm.displayName?has_content || realm.name?has_content)>
        <#assign realmCheck = ((realm.displayName!'') + ' ' + (realm.name!''))?lower_case>

        <#-- NATO Founding Members (1949) - 12 countries -->
        <#if realmCheck?contains("belgium") || realmCheck?contains("-bel")>
            <#assign hostInstance = "BEL"><#assign hostFlag = "🇧🇪"><#assign hostCountryName = "Belgium">
        <#elseif realmCheck?contains("canada") || realmCheck?contains("-can")>
            <#assign hostInstance = "CAN"><#assign hostFlag = "🇨🇦"><#assign hostCountryName = "Canada">
        <#elseif realmCheck?contains("denmark") || realmCheck?contains("danmark") || realmCheck?contains("-dnk")>
            <#assign hostInstance = "DNK"><#assign hostFlag = "🇩🇰"><#assign hostCountryName = "Denmark">
        <#elseif realmCheck?contains("france") || realmCheck?contains("-fra")>
            <#assign hostInstance = "FRA"><#assign hostFlag = "🇫🇷"><#assign hostCountryName = "France">
        <#elseif realmCheck?contains("iceland") || realmCheck?contains("-isl")>
            <#assign hostInstance = "ISL"><#assign hostFlag = "🇮🇸"><#assign hostCountryName = "Iceland">
        <#elseif realmCheck?contains("italy") || realmCheck?contains("italia") || realmCheck?contains("-ita")>
            <#assign hostInstance = "ITA"><#assign hostFlag = "🇮🇹"><#assign hostCountryName = "Italy">
        <#elseif realmCheck?contains("luxembourg") || realmCheck?contains("-lux")>
            <#assign hostInstance = "LUX"><#assign hostFlag = "🇱🇺"><#assign hostCountryName = "Luxembourg">
        <#elseif realmCheck?contains("netherlands") || realmCheck?contains("nederland") || realmCheck?contains("-nld")>
            <#assign hostInstance = "NLD"><#assign hostFlag = "🇳🇱"><#assign hostCountryName = "Netherlands">
        <#elseif realmCheck?contains("norway") || realmCheck?contains("norge") || realmCheck?contains("-nor")>
            <#assign hostInstance = "NOR"><#assign hostFlag = "🇳🇴"><#assign hostCountryName = "Norway">
        <#elseif realmCheck?contains("portugal") || realmCheck?contains("-prt")>
            <#assign hostInstance = "PRT"><#assign hostFlag = "🇵🇹"><#assign hostCountryName = "Portugal">
        <#elseif realmCheck?contains("united kingdom") || realmCheck?contains("britain") || realmCheck?contains("-gbr")>
            <#assign hostInstance = "GBR"><#assign hostFlag = "🇬🇧"><#assign hostCountryName = "United Kingdom">
        <#elseif realmCheck?contains("united states") || realmCheck?contains("america") || realmCheck?contains("-usa")>
            <#assign hostInstance = "USA"><#assign hostFlag = "🇺🇸"><#assign hostCountryName = "United States">

        <#-- Cold War Expansion (1952-1982) - 4 countries -->
        <#elseif realmCheck?contains("greece") || realmCheck?contains("hellas") || realmCheck?contains("-grc")>
            <#assign hostInstance = "GRC"><#assign hostFlag = "🇬🇷"><#assign hostCountryName = "Greece">
        <#elseif realmCheck?contains("turkey") || realmCheck?contains("türkiye") || realmCheck?contains("-tur")>
            <#assign hostInstance = "TUR"><#assign hostFlag = "🇹🇷"><#assign hostCountryName = "Turkey">
        <#elseif realmCheck?contains("germany") || realmCheck?contains("deutschland") || realmCheck?contains("-deu")>
            <#assign hostInstance = "DEU"><#assign hostFlag = "🇩🇪"><#assign hostCountryName = "Germany">
        <#elseif realmCheck?contains("spain") || realmCheck?contains("españa") || realmCheck?contains("-esp")>
            <#assign hostInstance = "ESP"><#assign hostFlag = "🇪🇸"><#assign hostCountryName = "Spain">

        <#-- Post-Cold War Expansion (1999) - 3 countries -->
        <#elseif realmCheck?contains("czechia") || realmCheck?contains("czech") || realmCheck?contains("-cze")>
            <#assign hostInstance = "CZE"><#assign hostFlag = "🇨🇿"><#assign hostCountryName = "Czechia">
        <#elseif realmCheck?contains("hungary") || realmCheck?contains("magyarország") || realmCheck?contains("-hun")>
            <#assign hostInstance = "HUN"><#assign hostFlag = "🇭🇺"><#assign hostCountryName = "Hungary">
        <#elseif realmCheck?contains("poland") || realmCheck?contains("polska") || realmCheck?contains("-pol")>
            <#assign hostInstance = "POL"><#assign hostFlag = "🇵🇱"><#assign hostCountryName = "Poland">

        <#-- 2004 Expansion (Big Bang) - 7 countries -->
        <#elseif realmCheck?contains("bulgaria") || realmCheck?contains("-bgr")>
            <#assign hostInstance = "BGR"><#assign hostFlag = "🇧🇬"><#assign hostCountryName = "Bulgaria">
        <#elseif realmCheck?contains("estonia") || realmCheck?contains("-est")>
            <#assign hostInstance = "EST"><#assign hostFlag = "🇪🇪"><#assign hostCountryName = "Estonia">
        <#elseif realmCheck?contains("latvia") || realmCheck?contains("-lva")>
            <#assign hostInstance = "LVA"><#assign hostFlag = "🇱🇻"><#assign hostCountryName = "Latvia">
        <#elseif realmCheck?contains("lithuania") || realmCheck?contains("-ltu")>
            <#assign hostInstance = "LTU"><#assign hostFlag = "🇱🇹"><#assign hostCountryName = "Lithuania">
        <#elseif realmCheck?contains("romania") || realmCheck?contains("-rou")>
            <#assign hostInstance = "ROU"><#assign hostFlag = "🇷🇴"><#assign hostCountryName = "Romania">
        <#elseif realmCheck?contains("slovakia") || realmCheck?contains("-svk")>
            <#assign hostInstance = "SVK"><#assign hostFlag = "🇸🇰"><#assign hostCountryName = "Slovakia">
        <#elseif realmCheck?contains("slovenia") || realmCheck?contains("-svn")>
            <#assign hostInstance = "SVN"><#assign hostFlag = "🇸🇮"><#assign hostCountryName = "Slovenia">

        <#-- 2009-2020 Expansion - 4 countries -->
        <#elseif realmCheck?contains("albania") || realmCheck?contains("-alb")>
            <#assign hostInstance = "ALB"><#assign hostFlag = "🇦🇱"><#assign hostCountryName = "Albania">
        <#elseif realmCheck?contains("croatia") || realmCheck?contains("hrvatska") || realmCheck?contains("-hrv")>
            <#assign hostInstance = "HRV"><#assign hostFlag = "🇭🇷"><#assign hostCountryName = "Croatia">
        <#elseif realmCheck?contains("montenegro") || realmCheck?contains("-mne")>
            <#assign hostInstance = "MNE"><#assign hostFlag = "🇲🇪"><#assign hostCountryName = "Montenegro">
        <#elseif realmCheck?contains("north macedonia") || realmCheck?contains("macedonia") || realmCheck?contains("-mkd")>
            <#assign hostInstance = "MKD"><#assign hostFlag = "🇲🇰"><#assign hostCountryName = "North Macedonia">

        <#-- Nordic Expansion (2023-2024) - 2 countries -->
        <#elseif realmCheck?contains("finland") || realmCheck?contains("suomi") || realmCheck?contains("-fin")>
            <#assign hostInstance = "FIN"><#assign hostFlag = "🇫🇮"><#assign hostCountryName = "Finland">
        <#elseif realmCheck?contains("sweden") || realmCheck?contains("sverige") || realmCheck?contains("-swe")>
            <#assign hostInstance = "SWE"><#assign hostFlag = "🇸🇪"><#assign hostCountryName = "Sweden">

        <#-- Non-NATO Partners (FVEY) -->
        <#elseif realmCheck?contains("australia") || realmCheck?contains("-aus")>
            <#assign hostInstance = "AUS"><#assign hostFlag = "🇦🇺"><#assign hostCountryName = "Australia">
        <#elseif realmCheck?contains("new zealand") || realmCheck?contains("-nzl")>
            <#assign hostInstance = "NZL"><#assign hostFlag = "🇳🇿"><#assign hostCountryName = "New Zealand">
        <#elseif realmCheck?contains("japan") || realmCheck?contains("-jpn")>
            <#assign hostInstance = "JPN"><#assign hostFlag = "🇯🇵"><#assign hostCountryName = "Japan">
        <#elseif realmCheck?contains("korea") || realmCheck?contains("-kor")>
            <#assign hostInstance = "KOR"><#assign hostFlag = "🇰🇷"><#assign hostCountryName = "South Korea">
        </#if>
    </#if>

    <#-- Fallback: Default to USA -->
    <#if !hostInstance?has_content>
        <#assign hostInstance = "USA"><#assign hostFlag = "🇺🇸"><#assign hostCountryName = "United States">
    </#if>
</head>

<body class="dive-body dive-compact ${bodyClass}" data-realm="<#if realm?? && realm.displayName?has_content>${realm.displayName}</#if>" data-instance="${hostInstance}">
    <!-- Background -->
    <div class="dive-background">
        <#if properties.backgroundImage?has_content>
            <div class="dive-background-image" style="background-image: url('${url.resourcesPath}/img/${properties.backgroundImage}');"></div>
            <div class="dive-background-overlay"></div>
        </#if>
    </div>

    <!-- ============================================ -->
    <!-- FEDERATION HANDOFF BANNER                   -->
    <!-- Modern 2025 UX with clear user education   -->
    <!-- ============================================ -->

    <#-- Detect USER'S HOME COUNTRY from federation context -->
    <#assign userHomeInstance = "">
    <#assign userHomeFlag = "🌐">
    <#assign userHomeCountryName = "Partner Nation">
    <#assign isFederatedLogin = false>

    <#-- Check for brokerContext (user coming from external IdP) -->
    <#-- Uses IdP alias format: "{country-code}-idp" (e.g., "usa-idp", "pol-idp") -->
    <#if brokerContext?? && brokerContext.identityProviderAlias?has_content>
        <#assign isFederatedLogin = true>
        <#assign idpAlias = brokerContext.identityProviderAlias?lower_case>

        <#-- NATO Founding Members (1949) -->
        <#if idpAlias?contains("bel")>
            <#assign userHomeInstance = "BEL"><#assign userHomeFlag = "🇧🇪"><#assign userHomeCountryName = "Belgium">
        <#elseif idpAlias?contains("can")>
            <#assign userHomeInstance = "CAN"><#assign userHomeFlag = "🇨🇦"><#assign userHomeCountryName = "Canada">
        <#elseif idpAlias?contains("dnk")>
            <#assign userHomeInstance = "DNK"><#assign userHomeFlag = "🇩🇰"><#assign userHomeCountryName = "Denmark">
        <#elseif idpAlias?contains("fra")>
            <#assign userHomeInstance = "FRA"><#assign userHomeFlag = "🇫🇷"><#assign userHomeCountryName = "France">
        <#elseif idpAlias?contains("isl")>
            <#assign userHomeInstance = "ISL"><#assign userHomeFlag = "🇮🇸"><#assign userHomeCountryName = "Iceland">
        <#elseif idpAlias?contains("ita")>
            <#assign userHomeInstance = "ITA"><#assign userHomeFlag = "🇮🇹"><#assign userHomeCountryName = "Italy">
        <#elseif idpAlias?contains("lux")>
            <#assign userHomeInstance = "LUX"><#assign userHomeFlag = "🇱🇺"><#assign userHomeCountryName = "Luxembourg">
        <#elseif idpAlias?contains("nld")>
            <#assign userHomeInstance = "NLD"><#assign userHomeFlag = "🇳🇱"><#assign userHomeCountryName = "Netherlands">
        <#elseif idpAlias?contains("nor")>
            <#assign userHomeInstance = "NOR"><#assign userHomeFlag = "🇳🇴"><#assign userHomeCountryName = "Norway">
        <#elseif idpAlias?contains("prt")>
            <#assign userHomeInstance = "PRT"><#assign userHomeFlag = "🇵🇹"><#assign userHomeCountryName = "Portugal">
        <#elseif idpAlias?contains("gbr")>
            <#assign userHomeInstance = "GBR"><#assign userHomeFlag = "🇬🇧"><#assign userHomeCountryName = "United Kingdom">
        <#elseif idpAlias?contains("usa")>
            <#assign userHomeInstance = "USA"><#assign userHomeFlag = "🇺🇸"><#assign userHomeCountryName = "United States">

        <#-- Cold War Expansion -->
        <#elseif idpAlias?contains("grc")>
            <#assign userHomeInstance = "GRC"><#assign userHomeFlag = "🇬🇷"><#assign userHomeCountryName = "Greece">
        <#elseif idpAlias?contains("tur")>
            <#assign userHomeInstance = "TUR"><#assign userHomeFlag = "🇹🇷"><#assign userHomeCountryName = "Turkey">
        <#elseif idpAlias?contains("deu")>
            <#assign userHomeInstance = "DEU"><#assign userHomeFlag = "🇩🇪"><#assign userHomeCountryName = "Germany">
        <#elseif idpAlias?contains("esp")>
            <#assign userHomeInstance = "ESP"><#assign userHomeFlag = "🇪🇸"><#assign userHomeCountryName = "Spain">

        <#-- Post-Cold War Expansion -->
        <#elseif idpAlias?contains("cze")>
            <#assign userHomeInstance = "CZE"><#assign userHomeFlag = "🇨🇿"><#assign userHomeCountryName = "Czechia">
        <#elseif idpAlias?contains("hun")>
            <#assign userHomeInstance = "HUN"><#assign userHomeFlag = "🇭🇺"><#assign userHomeCountryName = "Hungary">
        <#elseif idpAlias?contains("pol")>
            <#assign userHomeInstance = "POL"><#assign userHomeFlag = "🇵🇱"><#assign userHomeCountryName = "Poland">

        <#-- 2004 Expansion -->
        <#elseif idpAlias?contains("bgr")>
            <#assign userHomeInstance = "BGR"><#assign userHomeFlag = "🇧🇬"><#assign userHomeCountryName = "Bulgaria">
        <#elseif idpAlias?contains("est")>
            <#assign userHomeInstance = "EST"><#assign userHomeFlag = "🇪🇪"><#assign userHomeCountryName = "Estonia">
        <#elseif idpAlias?contains("lva")>
            <#assign userHomeInstance = "LVA"><#assign userHomeFlag = "🇱🇻"><#assign userHomeCountryName = "Latvia">
        <#elseif idpAlias?contains("ltu")>
            <#assign userHomeInstance = "LTU"><#assign userHomeFlag = "🇱🇹"><#assign userHomeCountryName = "Lithuania">
        <#elseif idpAlias?contains("rou")>
            <#assign userHomeInstance = "ROU"><#assign userHomeFlag = "🇷🇴"><#assign userHomeCountryName = "Romania">
        <#elseif idpAlias?contains("svk")>
            <#assign userHomeInstance = "SVK"><#assign userHomeFlag = "🇸🇰"><#assign userHomeCountryName = "Slovakia">
        <#elseif idpAlias?contains("svn")>
            <#assign userHomeInstance = "SVN"><#assign userHomeFlag = "🇸🇮"><#assign userHomeCountryName = "Slovenia">

        <#-- 2009-2020 Expansion -->
        <#elseif idpAlias?contains("alb")>
            <#assign userHomeInstance = "ALB"><#assign userHomeFlag = "🇦🇱"><#assign userHomeCountryName = "Albania">
        <#elseif idpAlias?contains("hrv")>
            <#assign userHomeInstance = "HRV"><#assign userHomeFlag = "🇭🇷"><#assign userHomeCountryName = "Croatia">
        <#elseif idpAlias?contains("mne")>
            <#assign userHomeInstance = "MNE"><#assign userHomeFlag = "🇲🇪"><#assign userHomeCountryName = "Montenegro">
        <#elseif idpAlias?contains("mkd")>
            <#assign userHomeInstance = "MKD"><#assign userHomeFlag = "🇲🇰"><#assign userHomeCountryName = "North Macedonia">

        <#-- Nordic Expansion -->
        <#elseif idpAlias?contains("fin")>
            <#assign userHomeInstance = "FIN"><#assign userHomeFlag = "🇫🇮"><#assign userHomeCountryName = "Finland">
        <#elseif idpAlias?contains("swe")>
            <#assign userHomeInstance = "SWE"><#assign userHomeFlag = "🇸🇪"><#assign userHomeCountryName = "Sweden">

        <#-- Non-NATO Partners -->
        <#elseif idpAlias?contains("aus")>
            <#assign userHomeInstance = "AUS"><#assign userHomeFlag = "🇦🇺"><#assign userHomeCountryName = "Australia">
        <#elseif idpAlias?contains("nzl")>
            <#assign userHomeInstance = "NZL"><#assign userHomeFlag = "🇳🇿"><#assign userHomeCountryName = "New Zealand">
        <#elseif idpAlias?contains("jpn")>
            <#assign userHomeInstance = "JPN"><#assign userHomeFlag = "🇯🇵"><#assign userHomeCountryName = "Japan">
        <#elseif idpAlias?contains("kor")>
            <#assign userHomeInstance = "KOR"><#assign userHomeFlag = "🇰🇷"><#assign userHomeCountryName = "South Korea">
        </#if>
    </#if>

    <#-- Also check client ID for federation hints -->
    <#-- IMPORTANT: Client ID patterns have different meanings:
         - dive-v3-{source}-federation: Source is {source} (coming FROM that country)
         - dive-v3-client-{target}: This is Hub's client for {target} - source is the HUB (USA)
         When we see dive-v3-client-{country} and hostInstance matches {country},
         it means Hub is federating TO us, so source = USA -->
    <#assign clientData = "">
    <#assign sourceInstance = "">
    <#assign sourceFlag = "">
    <#assign sourceCountryName = "">
    <#assign isReverseFedaration = false>
    <#if client?? && client.clientId??>
        <#assign clientData = client.clientId?lower_case>
        <#if clientData?contains("federation") || clientData?contains("broker") || clientData?contains("cross-border") || clientData?contains("client-")>
            <#assign isFederatedLogin = true>

            <#-- FIRST: Check if this is a reverse federation (Hub → Spoke) -->
            <#-- Patterns supported:
                 - dive-v3-client-{country}: OLD pattern where we ARE on that country's Keycloak
                 - dive-v3-broker-{country}: NEW pattern for bidirectional federation
                 Example: client=dive-v3-broker-swe on SWE Keycloak means Hub is connecting TO us
                 Example: client=dive-v3-broker-usa on Hub means Spoke is connecting FROM that spoke -->
            <#if (clientData?starts_with("dive-v3-client-") || clientData?starts_with("dive-v3-broker-")) && hostInstance?has_content>
                <#assign clientCountry = clientData?replace("dive-v3-client-", "")?replace("dive-v3-broker-", "")?upper_case>
                <#if clientCountry == hostInstance>
                    <#-- This is reverse federation! Source is the Hub (USA) -->
                    <#assign isReverseFedaration = true>
                    <#assign sourceInstance = "USA">
                    <#assign sourceFlag = "🇺🇸">
                    <#assign sourceCountryName = "United States">
                </#if>
            </#if>

            <#-- Only do country extraction from client ID if NOT reverse federation -->
            <#if !isReverseFedaration>
            <#-- Extract source country from client_id (e.g., dive-v3-usa-federation or dive-v3-client-alb) -->

            <#-- NATO Founding Members -->
            <#if clientData?contains("-bel-")>
                <#assign sourceInstance = "BEL"><#assign sourceFlag = "🇧🇪"><#assign sourceCountryName = "Belgium">
            <#elseif clientData?contains("-can-")>
                <#assign sourceInstance = "CAN"><#assign sourceFlag = "🇨🇦"><#assign sourceCountryName = "Canada">
            <#elseif clientData?contains("-dnk-")>
                <#assign sourceInstance = "DNK"><#assign sourceFlag = "🇩🇰"><#assign sourceCountryName = "Denmark">
            <#elseif clientData?contains("-fra-")>
                <#assign sourceInstance = "FRA"><#assign sourceFlag = "🇫🇷"><#assign sourceCountryName = "France">
            <#elseif clientData?contains("-isl-")>
                <#assign sourceInstance = "ISL"><#assign sourceFlag = "🇮🇸"><#assign sourceCountryName = "Iceland">
            <#elseif clientData?contains("-ita-")>
                <#assign sourceInstance = "ITA"><#assign sourceFlag = "🇮🇹"><#assign sourceCountryName = "Italy">
            <#elseif clientData?contains("-lux-")>
                <#assign sourceInstance = "LUX"><#assign sourceFlag = "🇱🇺"><#assign sourceCountryName = "Luxembourg">
            <#elseif clientData?contains("-nld-")>
                <#assign sourceInstance = "NLD"><#assign sourceFlag = "🇳🇱"><#assign sourceCountryName = "Netherlands">
            <#elseif clientData?contains("-nor-")>
                <#assign sourceInstance = "NOR"><#assign sourceFlag = "🇳🇴"><#assign sourceCountryName = "Norway">
            <#elseif clientData?contains("-prt-")>
                <#assign sourceInstance = "PRT"><#assign sourceFlag = "🇵🇹"><#assign sourceCountryName = "Portugal">
            <#elseif clientData?contains("-gbr-")>
                <#assign sourceInstance = "GBR"><#assign sourceFlag = "🇬🇧"><#assign sourceCountryName = "United Kingdom">
            <#elseif clientData?contains("-usa-")>
                <#assign sourceInstance = "USA"><#assign sourceFlag = "🇺🇸"><#assign sourceCountryName = "United States">

            <#-- Cold War Expansion -->
            <#elseif clientData?contains("-grc-")>
                <#assign sourceInstance = "GRC"><#assign sourceFlag = "🇬🇷"><#assign sourceCountryName = "Greece">
            <#elseif clientData?contains("-tur-")>
                <#assign sourceInstance = "TUR"><#assign sourceFlag = "🇹🇷"><#assign sourceCountryName = "Turkey">
            <#elseif clientData?contains("-deu-")>
                <#assign sourceInstance = "DEU"><#assign sourceFlag = "🇩🇪"><#assign sourceCountryName = "Germany">
            <#elseif clientData?contains("-esp-")>
                <#assign sourceInstance = "ESP"><#assign sourceFlag = "🇪🇸"><#assign sourceCountryName = "Spain">

            <#-- Post-Cold War Expansion -->
            <#elseif clientData?contains("-cze-")>
                <#assign sourceInstance = "CZE"><#assign sourceFlag = "🇨🇿"><#assign sourceCountryName = "Czechia">
            <#elseif clientData?contains("-hun-")>
                <#assign sourceInstance = "HUN"><#assign sourceFlag = "🇭🇺"><#assign sourceCountryName = "Hungary">
            <#elseif clientData?contains("-pol-")>
                <#assign sourceInstance = "POL"><#assign sourceFlag = "🇵🇱"><#assign sourceCountryName = "Poland">

            <#-- 2004 Expansion -->
            <#elseif clientData?contains("-bgr-")>
                <#assign sourceInstance = "BGR"><#assign sourceFlag = "🇧🇬"><#assign sourceCountryName = "Bulgaria">
            <#elseif clientData?contains("-est-")>
                <#assign sourceInstance = "EST"><#assign sourceFlag = "🇪🇪"><#assign sourceCountryName = "Estonia">
            <#elseif clientData?contains("-lva-")>
                <#assign sourceInstance = "LVA"><#assign sourceFlag = "🇱🇻"><#assign sourceCountryName = "Latvia">
            <#elseif clientData?contains("-ltu-")>
                <#assign sourceInstance = "LTU"><#assign sourceFlag = "🇱🇹"><#assign sourceCountryName = "Lithuania">
            <#elseif clientData?contains("-rou-")>
                <#assign sourceInstance = "ROU"><#assign sourceFlag = "🇷🇴"><#assign sourceCountryName = "Romania">
            <#elseif clientData?contains("-svk-")>
                <#assign sourceInstance = "SVK"><#assign sourceFlag = "🇸🇰"><#assign sourceCountryName = "Slovakia">
            <#elseif clientData?contains("-svn-")>
                <#assign sourceInstance = "SVN"><#assign sourceFlag = "🇸🇮"><#assign sourceCountryName = "Slovenia">

            <#-- 2009-2020 Expansion -->
            <#elseif clientData?contains("-alb-")>
                <#assign sourceInstance = "ALB"><#assign sourceFlag = "🇦🇱"><#assign sourceCountryName = "Albania">
            <#elseif clientData?contains("-hrv-")>
                <#assign sourceInstance = "HRV"><#assign sourceFlag = "🇭🇷"><#assign sourceCountryName = "Croatia">
            <#elseif clientData?contains("-mne-")>
                <#assign sourceInstance = "MNE"><#assign sourceFlag = "🇲🇪"><#assign sourceCountryName = "Montenegro">
            <#elseif clientData?contains("-mkd-")>
                <#assign sourceInstance = "MKD"><#assign sourceFlag = "🇲🇰"><#assign sourceCountryName = "North Macedonia">

            <#-- Nordic Expansion -->
            <#elseif clientData?contains("-fin-")>
                <#assign sourceInstance = "FIN"><#assign sourceFlag = "🇫🇮"><#assign sourceCountryName = "Finland">
            <#elseif clientData?contains("-swe-")>
                <#assign sourceInstance = "SWE"><#assign sourceFlag = "🇸🇪"><#assign sourceCountryName = "Sweden">

            <#-- Non-NATO Partners -->
            <#elseif clientData?contains("-aus-")>
                <#assign sourceInstance = "AUS"><#assign sourceFlag = "🇦🇺"><#assign sourceCountryName = "Australia">
            <#elseif clientData?contains("-nzl-")>
                <#assign sourceInstance = "NZL"><#assign sourceFlag = "🇳🇿"><#assign sourceCountryName = "New Zealand">
            <#elseif clientData?contains("-jpn-")>
                <#assign sourceInstance = "JPN"><#assign sourceFlag = "🇯🇵"><#assign sourceCountryName = "Japan">
            <#elseif clientData?contains("-kor-")>
                <#assign sourceInstance = "KOR"><#assign sourceFlag = "🇰🇷"><#assign sourceCountryName = "South Korea">

            <#-- Spoke-specific client pattern: dive-v3-client-{country} -->
            <#elseif clientData?contains("client-alb")>
                <#assign sourceInstance = "ALB"><#assign sourceFlag = "🇦🇱"><#assign sourceCountryName = "Albania">
            <#elseif clientData?contains("client-bel")>
                <#assign sourceInstance = "BEL"><#assign sourceFlag = "🇧🇪"><#assign sourceCountryName = "Belgium">
            <#elseif clientData?contains("client-bgr")>
                <#assign sourceInstance = "BGR"><#assign sourceFlag = "🇧🇬"><#assign sourceCountryName = "Bulgaria">
            <#elseif clientData?contains("client-can")>
                <#assign sourceInstance = "CAN"><#assign sourceFlag = "🇨🇦"><#assign sourceCountryName = "Canada">
            <#elseif clientData?contains("client-hrv")>
                <#assign sourceInstance = "HRV"><#assign sourceFlag = "🇭🇷"><#assign sourceCountryName = "Croatia">
            <#elseif clientData?contains("client-cze")>
                <#assign sourceInstance = "CZE"><#assign sourceFlag = "🇨🇿"><#assign sourceCountryName = "Czechia">
            <#elseif clientData?contains("client-dnk")>
                <#assign sourceInstance = "DNK"><#assign sourceFlag = "🇩🇰"><#assign sourceCountryName = "Denmark">
            <#elseif clientData?contains("client-est")>
                <#assign sourceInstance = "EST"><#assign sourceFlag = "🇪🇪"><#assign sourceCountryName = "Estonia">
            <#elseif clientData?contains("client-fin")>
                <#assign sourceInstance = "FIN"><#assign sourceFlag = "🇫🇮"><#assign sourceCountryName = "Finland">
            <#elseif clientData?contains("client-fra")>
                <#assign sourceInstance = "FRA"><#assign sourceFlag = "🇫🇷"><#assign sourceCountryName = "France">
            <#elseif clientData?contains("client-deu")>
                <#assign sourceInstance = "DEU"><#assign sourceFlag = "🇩🇪"><#assign sourceCountryName = "Germany">
            <#elseif clientData?contains("client-grc")>
                <#assign sourceInstance = "GRC"><#assign sourceFlag = "🇬🇷"><#assign sourceCountryName = "Greece">
            <#elseif clientData?contains("client-hun")>
                <#assign sourceInstance = "HUN"><#assign sourceFlag = "🇭🇺"><#assign sourceCountryName = "Hungary">
            <#elseif clientData?contains("client-isl")>
                <#assign sourceInstance = "ISL"><#assign sourceFlag = "🇮🇸"><#assign sourceCountryName = "Iceland">
            <#elseif clientData?contains("client-ita")>
                <#assign sourceInstance = "ITA"><#assign sourceFlag = "🇮🇹"><#assign sourceCountryName = "Italy">
            <#elseif clientData?contains("client-lva")>
                <#assign sourceInstance = "LVA"><#assign sourceFlag = "🇱🇻"><#assign sourceCountryName = "Latvia">
            <#elseif clientData?contains("client-ltu")>
                <#assign sourceInstance = "LTU"><#assign sourceFlag = "🇱🇹"><#assign sourceCountryName = "Lithuania">
            <#elseif clientData?contains("client-lux")>
                <#assign sourceInstance = "LUX"><#assign sourceFlag = "🇱🇺"><#assign sourceCountryName = "Luxembourg">
            <#elseif clientData?contains("client-mne")>
                <#assign sourceInstance = "MNE"><#assign sourceFlag = "🇲🇪"><#assign sourceCountryName = "Montenegro">
            <#elseif clientData?contains("client-nld")>
                <#assign sourceInstance = "NLD"><#assign sourceFlag = "🇳🇱"><#assign sourceCountryName = "Netherlands">
            <#elseif clientData?contains("client-mkd")>
                <#assign sourceInstance = "MKD"><#assign sourceFlag = "🇲🇰"><#assign sourceCountryName = "North Macedonia">
            <#elseif clientData?contains("client-nor")>
                <#assign sourceInstance = "NOR"><#assign sourceFlag = "🇳🇴"><#assign sourceCountryName = "Norway">
            <#elseif clientData?contains("client-pol")>
                <#assign sourceInstance = "POL"><#assign sourceFlag = "🇵🇱"><#assign sourceCountryName = "Poland">
            <#elseif clientData?contains("client-prt")>
                <#assign sourceInstance = "PRT"><#assign sourceFlag = "🇵🇹"><#assign sourceCountryName = "Portugal">
            <#elseif clientData?contains("client-rou")>
                <#assign sourceInstance = "ROU"><#assign sourceFlag = "🇷🇴"><#assign sourceCountryName = "Romania">
            <#elseif clientData?contains("client-svk")>
                <#assign sourceInstance = "SVK"><#assign sourceFlag = "🇸🇰"><#assign sourceCountryName = "Slovakia">
            <#elseif clientData?contains("client-svn")>
                <#assign sourceInstance = "SVN"><#assign sourceFlag = "🇸🇮"><#assign sourceCountryName = "Slovenia">
            <#elseif clientData?contains("client-esp")>
                <#assign sourceInstance = "ESP"><#assign sourceFlag = "🇪🇸"><#assign sourceCountryName = "Spain">
            <#elseif clientData?contains("client-swe")>
                <#assign sourceInstance = "SWE"><#assign sourceFlag = "🇸🇪"><#assign sourceCountryName = "Sweden">
            <#elseif clientData?contains("client-tur")>
                <#assign sourceInstance = "TUR"><#assign sourceFlag = "🇹🇷"><#assign sourceCountryName = "Turkey">
            <#elseif clientData?contains("client-gbr")>
                <#assign sourceInstance = "GBR"><#assign sourceFlag = "🇬🇧"><#assign sourceCountryName = "United Kingdom">

            <#-- NEW PATTERN: dive-v3-broker-{country} for bidirectional federation -->
            <#-- When on Hub and spoke connects, source is the spoke country -->
            <#elseif clientData?ends_with("broker-alb")>
                <#assign sourceInstance = "ALB"><#assign sourceFlag = "🇦🇱"><#assign sourceCountryName = "Albania">
            <#elseif clientData?ends_with("broker-bel")>
                <#assign sourceInstance = "BEL"><#assign sourceFlag = "🇧🇪"><#assign sourceCountryName = "Belgium">
            <#elseif clientData?ends_with("broker-bgr")>
                <#assign sourceInstance = "BGR"><#assign sourceFlag = "🇧🇬"><#assign sourceCountryName = "Bulgaria">
            <#elseif clientData?ends_with("broker-can")>
                <#assign sourceInstance = "CAN"><#assign sourceFlag = "🇨🇦"><#assign sourceCountryName = "Canada">
            <#elseif clientData?ends_with("broker-hrv")>
                <#assign sourceInstance = "HRV"><#assign sourceFlag = "🇭🇷"><#assign sourceCountryName = "Croatia">
            <#elseif clientData?ends_with("broker-cze")>
                <#assign sourceInstance = "CZE"><#assign sourceFlag = "🇨🇿"><#assign sourceCountryName = "Czechia">
            <#elseif clientData?ends_with("broker-dnk")>
                <#assign sourceInstance = "DNK"><#assign sourceFlag = "🇩🇰"><#assign sourceCountryName = "Denmark">
            <#elseif clientData?ends_with("broker-est")>
                <#assign sourceInstance = "EST"><#assign sourceFlag = "🇪🇪"><#assign sourceCountryName = "Estonia">
            <#elseif clientData?ends_with("broker-fin")>
                <#assign sourceInstance = "FIN"><#assign sourceFlag = "🇫🇮"><#assign sourceCountryName = "Finland">
            <#elseif clientData?ends_with("broker-fra")>
                <#assign sourceInstance = "FRA"><#assign sourceFlag = "🇫🇷"><#assign sourceCountryName = "France">
            <#elseif clientData?ends_with("broker-deu")>
                <#assign sourceInstance = "DEU"><#assign sourceFlag = "🇩🇪"><#assign sourceCountryName = "Germany">
            <#elseif clientData?ends_with("broker-grc")>
                <#assign sourceInstance = "GRC"><#assign sourceFlag = "🇬🇷"><#assign sourceCountryName = "Greece">
            <#elseif clientData?ends_with("broker-hun")>
                <#assign sourceInstance = "HUN"><#assign sourceFlag = "🇭🇺"><#assign sourceCountryName = "Hungary">
            <#elseif clientData?ends_with("broker-isl")>
                <#assign sourceInstance = "ISL"><#assign sourceFlag = "🇮🇸"><#assign sourceCountryName = "Iceland">
            <#elseif clientData?ends_with("broker-ita")>
                <#assign sourceInstance = "ITA"><#assign sourceFlag = "🇮🇹"><#assign sourceCountryName = "Italy">
            <#elseif clientData?ends_with("broker-lva")>
                <#assign sourceInstance = "LVA"><#assign sourceFlag = "🇱🇻"><#assign sourceCountryName = "Latvia">
            <#elseif clientData?ends_with("broker-ltu")>
                <#assign sourceInstance = "LTU"><#assign sourceFlag = "🇱🇹"><#assign sourceCountryName = "Lithuania">
            <#elseif clientData?ends_with("broker-lux")>
                <#assign sourceInstance = "LUX"><#assign sourceFlag = "🇱🇺"><#assign sourceCountryName = "Luxembourg">
            <#elseif clientData?ends_with("broker-mne")>
                <#assign sourceInstance = "MNE"><#assign sourceFlag = "🇲🇪"><#assign sourceCountryName = "Montenegro">
            <#elseif clientData?ends_with("broker-nld")>
                <#assign sourceInstance = "NLD"><#assign sourceFlag = "🇳🇱"><#assign sourceCountryName = "Netherlands">
            <#elseif clientData?ends_with("broker-mkd")>
                <#assign sourceInstance = "MKD"><#assign sourceFlag = "🇲🇰"><#assign sourceCountryName = "North Macedonia">
            <#elseif clientData?ends_with("broker-nor")>
                <#assign sourceInstance = "NOR"><#assign sourceFlag = "🇳🇴"><#assign sourceCountryName = "Norway">
            <#elseif clientData?ends_with("broker-pol")>
                <#assign sourceInstance = "POL"><#assign sourceFlag = "🇵🇱"><#assign sourceCountryName = "Poland">
            <#elseif clientData?ends_with("broker-prt")>
                <#assign sourceInstance = "PRT"><#assign sourceFlag = "🇵🇹"><#assign sourceCountryName = "Portugal">
            <#elseif clientData?ends_with("broker-rou")>
                <#assign sourceInstance = "ROU"><#assign sourceFlag = "🇷🇴"><#assign sourceCountryName = "Romania">
            <#elseif clientData?ends_with("broker-svk")>
                <#assign sourceInstance = "SVK"><#assign sourceFlag = "🇸🇰"><#assign sourceCountryName = "Slovakia">
            <#elseif clientData?ends_with("broker-svn")>
                <#assign sourceInstance = "SVN"><#assign sourceFlag = "🇸🇮"><#assign sourceCountryName = "Slovenia">
            <#elseif clientData?ends_with("broker-esp")>
                <#assign sourceInstance = "ESP"><#assign sourceFlag = "🇪🇸"><#assign sourceCountryName = "Spain">
            <#elseif clientData?ends_with("broker-swe")>
                <#assign sourceInstance = "SWE"><#assign sourceFlag = "🇸🇪"><#assign sourceCountryName = "Sweden">
            <#elseif clientData?ends_with("broker-tur")>
                <#assign sourceInstance = "TUR"><#assign sourceFlag = "🇹🇷"><#assign sourceCountryName = "Turkey">
            <#elseif clientData?ends_with("broker-gbr")>
                <#assign sourceInstance = "GBR"><#assign sourceFlag = "🇬🇧"><#assign sourceCountryName = "United Kingdom">
            <#elseif clientData?ends_with("broker-usa")>
                <#assign sourceInstance = "USA"><#assign sourceFlag = "🇺🇸"><#assign sourceCountryName = "United States">
            <#-- Non-NATO partners via broker pattern -->
            <#elseif clientData?ends_with("broker-aus")>
                <#assign sourceInstance = "AUS"><#assign sourceFlag = "🇦🇺"><#assign sourceCountryName = "Australia">
            <#elseif clientData?ends_with("broker-nzl")>
                <#assign sourceInstance = "NZL"><#assign sourceFlag = "🇳🇿"><#assign sourceCountryName = "New Zealand">
            <#elseif clientData?ends_with("broker-jpn")>
                <#assign sourceInstance = "JPN"><#assign sourceFlag = "🇯🇵"><#assign sourceCountryName = "Japan">
            <#elseif clientData?ends_with("broker-kor")>
                <#assign sourceInstance = "KOR"><#assign sourceFlag = "🇰🇷"><#assign sourceCountryName = "South Korea">

            <#-- Legacy cross-border client (backward compatibility) -->
            <#elseif clientData?contains("cross-border")>
                <#-- Fallback for old generic cross-border client - default to ALB -->
                <#if hostInstance == "USA">
                    <#assign sourceInstance = "ALB">
                    <#assign sourceFlag = "🇦🇱">
                    <#assign sourceCountryName = "Albania">
                <#else>
                    <#assign sourceInstance = "USA">
                    <#assign sourceFlag = "🇺🇸">
                    <#assign sourceCountryName = "United States">
                </#if>
            </#if>
            </#if><#-- End of !isReverseFedaration block -->
        </#if>
    </#if>

    <!-- Main Container -->
    <div class="dive-container">

        <#-- Show Federation Handoff Banner when cross-border authentication detected -->
        <#-- This shows when: user comes from a different instance (sourceInstance != hostInstance) -->
        <#if isFederatedLogin && sourceInstance?has_content && sourceInstance != hostInstance>
        <div class="dive-federation-banner dive-federation-banner-animated">
            <div class="dive-federation-handoff">
                <!-- LEFT: Your Identity (Where you're authenticating) -->
                <div class="dive-handoff-source">
                    <div class="dive-handoff-flag-container dive-flag-glow">
                        <span class="dive-handoff-flag">${hostFlag}</span>
                    </div>
                    <div class="dive-handoff-label">
                        <span class="dive-handoff-micro">Your Identity</span>
                        <span class="dive-handoff-country">${hostInstance}</span>
                    </div>
                </div>

                <!-- Animated Flow Indicator -->
                <div class="dive-handoff-flow">
                    <div class="dive-handoff-arrow-track">
                        <div class="dive-handoff-arrow-particle"></div>
                    </div>
                    <span class="dive-handoff-via">→</span>
                </div>

                <!-- RIGHT: Destination Application (Where you want access) -->
                <div class="dive-handoff-destination">
                    <div class="dive-handoff-flag-container dive-flag-pulse">
                        <span class="dive-handoff-flag">${sourceFlag}</span>
                    </div>
                    <div class="dive-handoff-label">
                        <span class="dive-handoff-micro">Accessing</span>
                        <span class="dive-handoff-country">${sourceInstance}</span>
                    </div>
                </div>
            </div>

            <!-- Policy Notice - Expandable -->
            <details class="dive-policy-notice">
                <summary class="dive-policy-trigger">
                    <svg class="dive-policy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Cross-Border Access · Tap to learn more</span>
                    <svg class="dive-policy-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </summary>
                <div class="dive-policy-content">
                    <p class="dive-policy-main">
                        <strong>🤝 Bilateral Trust Agreement</strong><br/>
                        By authenticating through <strong>${hostCountryName}</strong> to access <strong>${sourceCountryName}</strong>'s resources,
                        you agree to operate under ${sourceCountryName}'s data governance policies.
                    </p>
                    <ul class="dive-policy-list">
                        <li>✓ Your identity is verified by ${hostCountryName} (${hostInstance})</li>
                        <li>✓ Access decisions follow ${sourceInstance}'s security policies</li>
                        <li>✓ Your actions may be logged for audit compliance</li>
                    </ul>
                </div>
            </details>
        </div>
        </#if>

        <!-- Split Layout -->
        <div class="dive-layout">
            <!-- LEFT: Login Form -->
            <div class="dive-form-column">
                <div class="dive-card">
                    <!-- Instance Identity Banner - Informative -->
                    <div class="dive-realm-banner">
                        <div class="dive-realm-flag">
                            ${hostFlag}
                        </div>
                        <div class="dive-realm-info">
                            <div class="dive-realm-country">
                                <#if hostCountryName?has_content>${hostCountryName?upper_case}<#else>${hostInstance}</#if>
                            </div>
                            <div class="dive-realm-context">${msg("dive.banner.context")}</div>
                        </div>
                    </div>

                    <!-- Alert Messages (Compact) -->
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="dive-alert dive-alert-compact dive-alert-${message.type}">
                            <#if message.type = 'success'>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            <#elseif message.type = 'warning'>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            <#elseif message.type = 'error'>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            <#else>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </#if>
                            <span class="dive-alert-text">${kcSanitize(message.summary)?no_esc}</span>
                        </div>
                    </#if>

                    <!-- Header Section -->
                    <div class="dive-header dive-header-compact">
                        <#nested "header">
                    </div>

                    <!-- Form Content -->
                    <div class="dive-form-content">
                        <#nested "form">
                    </div>

                    <!-- Info Section -->
                    <#if displayInfo>
                        <div class="dive-info dive-info-compact">
                            <#nested "info">
                        </div>
                    </#if>
                </div>
            </div>

            <!-- RIGHT: Trust Chain & Transparency Panel -->
            <#-- Determine IdP info for transparency panel -->
            <#-- Use hostInstance as the "IdP" for this realm (since this IS the IdP) -->
            <#assign idpCodeVal = hostInstance!'USA'>
            <#assign idpCountryName = hostCountryName!'United States'>
            <#assign idpFlag = hostFlag!'🇺🇸'>

            <#-- Override with userHomeInstance if this is a federation flow -->
            <#if isFederatedLogin && userHomeInstance?has_content>
                <#assign idpCodeVal = userHomeInstance>
                <#assign idpCountryName = userHomeCountryName>
                <#assign idpFlag = userHomeFlag>
            </#if>

            <#assign idpCountryCode = idpCodeVal>

            <div class="dive-description-column">
                <div class="dive-transparency-panel">

                    <!-- TEMP DEBUG: Show detection values -->
                    <div style="background: #1e3a5f; color: white; padding: 8px; margin-bottom: 10px; font-size: 11px; border-left: 3px solid #3b82f6;">
                        <strong>🔍 Detection:</strong><br/>
                        clientId: <code style="background: rgba(255,255,255,0.1); padding: 2px 4px;">${(client.clientId)!'NONE'}</code><br/>
                        sourceInstance: <code style="background: rgba(255,255,255,0.1); padding: 2px 4px;">${sourceInstance!'EMPTY'}</code><br/>
                        hostInstance: <code style="background: rgba(255,255,255,0.1); padding: 2px 4px;">${hostInstance!'EMPTY'}</code><br/>
                        isFederated: <code style="background: rgba(255,255,255,0.1); padding: 2px 4px;">${isFederatedLogin?string('true','false')}</code><br/>
                        Match: <code style="background: rgba(255,255,255,0.1); padding: 2px 4px;">${(isFederatedLogin && sourceInstance?has_content && sourceInstance != hostInstance)?string('true','false')}</code>
                    </div>

                    <!-- LEVEL 0: Trust Chain Summary (Always Visible) -->
                    <div class="dive-trust-summary">
                        <#-- Show different trust chains for federation vs direct login -->
                        <#if isFederatedLogin && sourceInstance?has_content && sourceInstance != hostInstance>
                        <#-- FEDERATION FLOW: Show full handoff chain -->
                        <div class="dive-trust-chain-visual dive-trust-federation">
                            <div class="dive-trust-node dive-trust-idp">
                                <span class="dive-trust-flag">${hostFlag}</span>
                                <span class="dive-trust-label">${hostInstance}</span>
                                <span class="dive-trust-sublabel">Identity</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-sp">
                                <span class="dive-trust-flag">${sourceFlag}</span>
                                <span class="dive-trust-label">${sourceInstance}</span>
                                <span class="dive-trust-sublabel">Application</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-hub">
                                <span class="dive-trust-icon">🤝</span>
                                <span class="dive-trust-label">Coalition</span>
                                <span class="dive-trust-sublabel">Resources</span>
                            </div>
                        </div>
                        <div class="dive-trust-explanation">
                            <p class="dive-trust-flow-text">
                                Use your <strong>${hostInstance}</strong>-approved identity
                                <span class="dive-flow-divider">→</span>
                                Access <strong>${sourceInstance}</strong> application
                                <span class="dive-flow-divider">→</span>
                                Unlock shared coalition resources
                            </p>
                        </div>
                        <#else>
                        <#-- DIRECT LOGIN: Show simple, clear explanation -->
                        <div class="dive-trust-chain-visual">
                            <div class="dive-trust-node dive-trust-idp">
                                <span class="dive-trust-flag">${idpFlag}</span>
                                <span class="dive-trust-label">${idpCountryCode}</span>
                                <span class="dive-trust-sublabel">Your Credentials</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-hub">
                                <span class="dive-trust-icon">🔐</span>
                                <span class="dive-trust-label">Verified</span>
                                <span class="dive-trust-sublabel">Identity Check</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-sp">
                                <span class="dive-trust-icon">📁</span>
                                <span class="dive-trust-label">Access</span>
                                <span class="dive-trust-sublabel">Coalition Data</span>
                            </div>
                        </div>
                        <p class="dive-trust-tagline">${msg("dive.trust.tagline")}</p>
                        </#if>
                    </div>

                    <!-- LEVEL 1: "How does this work?" (Expandable) -->
                    <details class="dive-microprogression dive-level-1">
                        <summary class="dive-expand-trigger">
                            ${msg("dive.trust.howItWorks")}
                            <svg class="dive-expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-expand-content">
                            <ol class="dive-trust-steps">
                                <li>
                                    <strong>${idpCountryName}</strong> ${msg("dive.trust.step1")}
                                </li>
                                <li>
                                    <strong>DIVE</strong> ${msg("dive.trust.step2")}
                                </li>
                                <li>
                                    ${msg("dive.trust.step3")}
                                </li>
                            </ol>
                        </div>
                    </details>

                    <!-- LEVEL 2: "What gets shared?" (Auto-expanded) -->
                    <details class="dive-microprogression dive-level-2" open>
                        <summary class="dive-expand-trigger">
                            ${msg("dive.trust.whatShared")}
                            <svg class="dive-expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-expand-content">
                            <ul class="dive-attribute-list">
                                <li>
                                    <span class="dive-attr-icon">🆔</span>
                                    <span class="dive-attr-name">${msg("dive.attr.uniqueId")}</span>
                                </li>
                                <li>
                                    <span class="dive-attr-icon">🔐</span>
                                    <span class="dive-attr-name">${msg("dive.attr.clearance")}</span>
                                </li>
                                <li>
                                    <span class="dive-attr-icon">🌍</span>
                                    <span class="dive-attr-name">${msg("dive.attr.country")}</span>
                                </li>
                                <li>
                                    <span class="dive-attr-icon">🏷️</span>
                                    <span class="dive-attr-name">${msg("dive.attr.coi")}</span>
                                </li>
                            </ul>
                            <p class="dive-attr-note">${msg("dive.attr.note")}</p>
                        </div>
                    </details>

                    <!-- LEVEL 3: "Technical Details" (Expandable) -->
                    <details class="dive-microprogression dive-level-3">
                        <summary class="dive-expand-trigger">
                            ${msg("dive.trust.technical")}
                            <svg class="dive-expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-expand-content dive-technical">
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.protocol")}</span>
                                <span class="dive-tech-value">OpenID Connect / SAML 2.0</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.tokenFormat")}</span>
                                <span class="dive-tech-value">JWT (RS256)</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.policyEngine")}</span>
                                <span class="dive-tech-value">OPA (Rego)</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.standard")}</span>
                                <span class="dive-tech-value">ACP-240 / STANAG 4774</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.realm")}</span>
                                <span class="dive-tech-value"><#if realm?? && realm.name?has_content>${realm.name}<#else>dive-v3</#if></span>
                            </div>
                        </div>
                    </details>

                    <!-- Help Notice (Generic) -->
                    <div class="dive-help-footer">
                        <button type="button" class="dive-help-trigger-small" onclick="document.getElementById('helpPanel').classList.toggle('dive-hidden')">
                            ${msg("dive.help.trigger")}
                        </button>
                        <div id="helpPanel" class="dive-help-panel dive-hidden">
                            <p class="dive-help-heading">${msg("dive.help.heading")}</p>
                            <ul class="dive-help-list">
                                <li>${msg("dive.help.item1")}</li>
                                <li>${msg("dive.help.item2")}</li>
                                <li>${msg("dive.help.item3")}</li>
                            </ul>
                            <p class="dive-help-note">${msg("dive.help.note")}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts -->
    <script>
        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eye-icon');
            const eyeOffIcon = document.getElementById('eye-off-icon');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.classList.add('dive-hidden');
                eyeOffIcon.classList.remove('dive-hidden');
            } else {
                passwordInput.type = 'password';
                eyeIcon.classList.remove('dive-hidden');
                eyeOffIcon.classList.add('dive-hidden');
            }
        }

        // Toggle forgot password info panel (matches desktop behavior)
        function toggleForgotPasswordInfo() {
            const infoPanel = document.getElementById('forgot-password-info');
            const chevron = document.getElementById('forgot-chevron');

            if (infoPanel.classList.contains('dive-hidden')) {
                infoPanel.classList.remove('dive-hidden');
                infoPanel.style.maxHeight = infoPanel.scrollHeight + 'px';
                chevron.style.transform = 'rotate(180deg)';
            } else {
                infoPanel.style.maxHeight = '0';
                setTimeout(() => infoPanel.classList.add('dive-hidden'), 300);
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    </script>
    <#if properties.scriptsBottom?has_content>
        <#list properties.scriptsBottom?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
</body>
</html>
</#macro>
