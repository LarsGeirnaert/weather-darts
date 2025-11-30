import random
import time
import requests 

# --- Configuratie ---
# OPMERKING: Je gebruikt nu de API die registratie vereist om op stadsnaam te kunnen zoeken.
# 1. HAAL EEN GRATIS API-SLEUTEL OP (bijv. van OpenWeatherMap)
API_KEY = "b10dc274a5e56f6f6fc4fe68a7987217"
WEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather" 
MAX_TURNS = 5 # Aantal beurten (gokken)

# --- API Test Functie ---

def test_api_connection(api_key: str, api_url: str) -> bool:
    """
    Test de API-sleutel door een verzoek te sturen voor een bekende stad (Londen).
    """
    print("\n🔬 API-verbinding testen...")
    test_params = {
        'q': "London",
        'appid': api_key,
        'units': 'metric'
    }

    try:
        response = requests.get(api_url, params=test_params, timeout=5)
        
        if response.status_code == 200:
            print("✅ API-sleutel is geldig en actief. Spel start nu met live data!")
            return True
        elif response.status_code == 401:
            print("❌ FOUT (401 Unauthorized): API-sleutel is ongeldig of nog niet actief.")
            print("Wacht 10-30 minuten na aanmaken op de OpenWeatherMap website.")
            return False
        else:
            # Vang andere foutcodes op (bv. 400 Bad Request, 500 Server Error)
            print(f"❌ FOUT ({response.status_code}): Kan de API niet bereiken of ongeldige aanvraag.")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Netwerkfout: Kan geen verbinding maken met de API-service. Controleer je internetverbinding.")
        return False


# --- API Functie ---

def haal_temperatuur_op(stad: str) -> float | None:
    """
    Haalt de live temperatuur (in Celsius) op voor een opgegeven stad.
    Retourneert de temperatuur of None als de stad niet gevonden is of er een fout optreedt.
    """
    
    params = {
        'q': stad,
        'appid': API_KEY,
        'units': 'metric' # Voor Celsius
    }

    print(f"🌍 Live weer ophalen voor {stad} via API...")

    try:
        response = requests.get(WEATHER_API_URL, params=params, timeout=5)
        response.raise_for_status() 
        data = response.json()
        
        temp = data['main']['temp']
        print("✅ Live temperatuur geladen.")
        return round(temp, 1) # Temperatuur in Celsius

    except requests.exceptions.HTTPError as e:
        if response.status_code == 404:
            print(f"❌ Fout: De stad '{stad}' is niet gevonden. Probeer een andere stad.")
        # 401 wordt al opgevangen in test_api_connection, maar blijft als vangnet.
        elif response.status_code == 401:
            print("❌ FOUT (401 Unauthorized): API-sleutel is ongeldig.")
        else:
            print(f"❌ Fout bij API-call: {e}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Netwerkfout: Kan geen verbinding maken met de API: {e}")
        return None

# --- Hoofd Spel Logica ---

def main():
    """
    Hoofdfunctie om het Temperatuur Aftrek Spel te starten.
    """
    
    # 0. Test de API-verbinding
    if not test_api_connection(API_KEY, WEATHER_API_URL):
        print("\nSpel kan niet starten omdat de API-verbinding mislukte.")
        return # Stop het spel als de API niet werkt

    # 1. Initialiseer het spel
    target_temp = random.randint(50, 150)
    beurten_over = MAX_TURNS
    
    print("\n" + "="*50)
    print("🌡️ TEMPERATUUR AFTREK SPEL (5 BEURTEN) 🌡️")
    print("DOEL: Eindig na 5 beurten zo dicht mogelijk bij 0°C (niet negatief).")
    print("="*50)
    print(f"HET START DOEL IS: {target_temp}°C")
    print("="*50)
    
    # 2. Start de spel-loop
    while beurten_over > 0 and target_temp > 0:
        print(f"\n--- BEURT {MAX_TURNS - beurten_over + 1} van {MAX_TURNS} ---")
        print(f"Nog af te trekken: {target_temp:.1f}°C")
        
        stad_naam = input("Voer een stad in om de temperatuur af te trekken (bv. 'Tokyo', 'Londen'): ").strip()
        
        if not stad_naam:
            print("Voer alsjeblieft een geldige stad in.")
            continue
            
        temperatuur = haal_temperatuur_op(stad_naam)
        
        if temperatuur is None:
            continue # Probeer opnieuw
            
        # 3. Verwerk de worp
        print(f"\nStad: {stad_naam}")
        print(f"Huidige Temperatuur: {temperatuur}°C")
        
        nieuwe_target_temp = target_temp - temperatuur
        
        print(f"Aftreksom: {target_temp:.1f}°C - {temperatuur:.1f}°C = {nieuwe_target_temp:.1f}°C")
        
        target_temp = nieuwe_target_temp
        beurten_over -= 1
        
        # Geef de speler feedback
        if target_temp > 0 and beurten_over > 0:
            print(f"Resterend doel: {target_temp:.1f}°C. Nog {beurten_over} beurten te gaan.")
        elif target_temp == 0:
            print("\n🎉 PERFECTE SCORE! Je hebt precies 0.0°C bereikt! 🎉")
            break
        elif target_temp < 0:
            print("\n🚨 OEPS! Je hebt onder 0.0°C gezeten.")
            print(f"Eindresultaat: {target_temp:.1f}°C (Te Laag)")
            break

    # 4. Eindresultaat
    print("\n" + "="*50)
    print("EIND VAN HET SPEL")
    print("="*50)
    
    if target_temp == 0:
        print("🏆 GEWONNEN! Je bent de meester van de weertrucs!")
    elif target_temp > 0:
        print(f"De beurten zijn op. Je hebt nog {target_temp:.1f}°C over.")
        print(f"Score: Hoe lager, hoe beter. {target_temp:.1f} punten.")
    else: # target_temp < 0
        print(f"❌ Je bent onder nul geëindigd met {target_temp:.1f}°C.")
        print("Score: Te Laag. Probeer de volgende keer conservatiever te zijn!")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nFATALE FOUT: Er is iets misgegaan: {e}")
        print("Zorg ervoor dat je 'requests' hebt geïnstalleerd in de virtuele omgeving.")
