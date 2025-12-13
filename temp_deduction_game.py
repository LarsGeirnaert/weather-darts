import random
import time
import requests

# --- Configuratie ---
API_KEY = "b10dc274a5e56f6f6fc4fe68a7987217"
# LET OP: We gebruiken nu 'forecast' in plaats van 'weather'
FORECAST_API_URL = "http://api.openweathermap.org/data/2.5/forecast"
MAX_TURNS = 5 

# --- API Test Functie ---
def test_api_connection(api_key: str, api_url: str) -> bool:
    print("\n🔬 API-verbinding testen...")
    test_params = {
        'q': "London",
        'appid': api_key,
        'units': 'metric',
        'cnt': 1 # We hebben maar 1 resultaat nodig voor de test
    }

    try:
        response = requests.get(api_url, params=test_params, timeout=5)

        if response.status_code == 200:
            print("✅ API-sleutel is geldig. Spel start met MAX dagtemperatuur!")
            return True
        elif response.status_code == 401:
            print("❌ FOUT (401): API-sleutel ongeldig.")
            return False
        else:
            print(f"❌ FOUT ({response.status_code}): {response.text}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Netwerkfout: {e}")
        return False


# --- API Functie (AANGEPAST) ---

def haal_temperatuur_op(stad: str) -> float | None:
    """
    Haalt de MAXIMALE temperatuur van VANDAAG op voor een stad.
    Gebruikt de forecast API.
    """
    params = {
        'q': stad,
        'appid': API_KEY,
        'units': 'metric'
    }

    print(f"🌍 Weergegevens ophalen voor {stad}...")

    try:
        response = requests.get(FORECAST_API_URL, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()

        # 1. Bepaal de datum van "vandaag" (eerste item in de lijst)
        # De API geeft tijden in tekstformaat: "2023-10-25 15:00:00"
        if not data['list']:
            return None
            
        vandaag_datum_str = data['list'][0]['dt_txt'].split(' ')[0] # Bijv. "2023-10-25"

        max_temp = -1000.0 # Start heel laag
        found_today = False

        # 2. Loop door de voorspellingen (3-uurs blokken)
        for item in data['list']:
            datum_deel = item['dt_txt'].split(' ')[0]
            
            # We kijken alleen naar blokken die op de datum van vandaag vallen
            if datum_deel == vandaag_datum_str:
                temp_in_blok = item['main']['temp_max'] # Pak de max temp binnen dit 3-uurs blok
                if temp_in_blok > max_temp:
                    max_temp = temp_in_blok
                found_today = True
            else:
                # Zodra we een datum tegenkomen die niet vandaag is, kunnen we stoppen (optimalisatie)
                break

        if not found_today:
            print(f"❌ Geen data voor vandaag gevonden voor {stad}.")
            return None

        print(f"✅ Max temperatuur voor vandaag gevonden.")
        return round(max_temp, 1)

    except requests.exceptions.HTTPError:
        if response.status_code == 404:
            print(f"❌ Stad '{stad}' niet gevonden.")
        else:
            print("❌ API Fout.")
        return None
    except Exception as e:
        print(f"❌ Er ging iets mis: {e}")
        return None

# --- Hoofd Spel Logica ---

def main():
    if not test_api_connection(API_KEY, FORECAST_API_URL):
        return

    target_temp = random.randint(50, 150)
    beurten_over = MAX_TURNS

    print("\n" + "="*50)
    print("🌡️ TEMPERATUUR AFTREK SPEL (MAX TEMP EDITIE) 🌡️")
    print("DOEL: Eindig na 5 beurten zo dicht mogelijk bij 0°C.")
    print("De temperatuur die wordt afgetrokken is de HOOGSTE temp van vandaag.")
    print("="*50)
    print(f"HET START DOEL IS: {target_temp}°C")
    print("="*50)

    while beurten_over > 0 and target_temp > 0:
        print(f"\n--- BEURT {MAX_TURNS - beurten_over + 1} van {MAX_TURNS} ---")
        print(f"Nog af te trekken: {target_temp:.1f}°C")

        stad_naam = input("Voer een stad in (bv. 'Madrid', 'Kaapstad'): ").strip()

        if not stad_naam:
            continue

        temperatuur = haal_temperatuur_op(stad_naam)

        if temperatuur is None:
            continue

        print(f"\nStad: {stad_naam}")
        print(f"Hoogste dagtemperatuur: {temperatuur}°C")

        nieuwe_target_temp = target_temp - temperatuur
        print(f"Som: {target_temp:.1f}°C - {temperatuur:.1f}°C = {nieuwe_target_temp:.1f}°C")

        target_temp = nieuwe_target_temp
        beurten_over -= 1

        if target_temp == 0:
            print("\n🎉 PERFECTE SCORE! Precies 0.0°C! 🎉")
            break
        elif target_temp < 0:
            print(f"\n🚨 OEPS! Onder nul: {target_temp:.1f}°C.")
            break

    print("\n" + "="*50)
    if target_temp == 0:
        print("🏆 GEWONNEN!")
    elif target_temp > 0:
        print(f"Eindstand: {target_temp:.1f}°C over.")
    else:
        print(f"Eindstand: {target_temp:.1f}°C (Onder nul).")

if __name__ == "__main__":
    main()