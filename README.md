# Vinskap

Mobilvennlig privat vinapp.

## Funksjoner
- Viner lagres i IndexedDB, adskilt fra appkoden.
- Hvit sone: hvitvin, rosé og musserende. Rød sone: rødvin og portvin.
- Strekkodebilde leses automatisk og starter vinsøk.
- Etikettbilde OCR-leses automatisk og starter vinsøk.
- Vinmonopolet er foretrukket kilde for produktinformasjon.
- Mine turer med bilde og notat.
- Backup til JSON og eksport til CSV.
- PWA-støtte for å legge appen på hjemskjermen.

Versjon 1.1 forbedrer skanning på iPhone: bildet bekreftes straks i appen,
strekkoden prøves mot flere utsnitt, etikettlesing viser fremdrift, og appen
oppdaterer bufrede filer automatisk.

## Vinmonopolet API
Appen forventer miljøvariabelen `VINMONOPOLET_API_KEY` på serveren. Nøkkelen skal ikke legges i frontend eller pushes til GitHub.

API-funksjonen bruker `https://apis.vinmonopolet.no/products/v0/details-normal` og sender nøkkelen i headeren `Ocp-Apim-Subscription-Key`.

## Publisering
Oppsettet er laget for Vercel eller annen Node-kompatibel serverless-hosting. Koble GitHub-repoet til hostingen og legg inn `VINMONOPOLET_API_KEY` som en hemmelig miljøvariabel.
