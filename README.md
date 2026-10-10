# Rejestr przesyłek

Aplikacja webowa dla kilku użytkowników w zaufanej sieci lokalnej. Node.js udostępnia interfejs i API, a PostgreSQL przechowuje wspólne dane. Komputery użytkowników łączą się z serwerem przez przeglądarkę; nie łączą się bezpośrednio z bazą.

## Wymagania

- Node.js 20 lub nowszy.
- PostgreSQL 16 lub nowszy, zainstalowany bezpośrednio w Windows na komputerze serwerowym.
- Komputer serwerowy ze stałym adresem IP w sieci firmowej.

## Pierwsze uruchomienie

1. Pobierz instalator PostgreSQL dla Windows z [oficjalnej strony PostgreSQL](https://www.postgresql.org/download/windows/) i zainstaluj serwer PostgreSQL na komputerze serwerowym. Zanotuj hasło administratora ustawione podczas instalacji. Upewnij się, że usługa PostgreSQL działa. Instalator zawiera również narzędzie pgAdmin, którym utworzysz bazę oraz konto aplikacji.
2. Otwórz pgAdmin, połącz się z lokalnym serwerem PostgreSQL, utwórz bazę danych `magazyn` i użytkownika `magazyn_app` z silnym hasłem. Nadaj temu użytkownikowi uprawnienia do bazy. Baza pozostaje lokalna na komputerze serwerowym — pozostali użytkownicy łączą się z aplikacją Node.js, a nie bezpośrednio z PostgreSQL.
3. Plik `.env` jest już przygotowany w katalogu projektu. Zachowaj jego istniejące `SESSION_SECRET` i ustaw `DATABASE_URL`, aby zawierał nazwę użytkownika, hasło, lokalny adres `127.0.0.1`, port PostgreSQL (domyślnie `5432`) oraz bazę `magazyn`. Na przykład `postgresql://magazyn_app:TWOJE_HASLO@127.0.0.1:5432/magazyn`. Jeśli hasło zawiera znaki specjalne, zakoduj je w formacie URL. Nie udostępniaj pliku `.env`.

   Jeśli `.env` nie istnieje, skopiuj `.env.example` do `.env`. Wygeneruj tajny klucz sesji:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Wygenerowaną wartość wpisz jako `SESSION_SECRET`. Nie udostępniaj ani nie dodawaj pliku `.env` do repozytorium.
4. Zainstaluj zależności poleceniem `npm install`.
5. Utwórz indywidualne konto dla każdej osoby:

   ```powershell
   npm run create-user -- operator
   ```

   Hasło jest wprowadzane bez wyświetlania na ekranie; musi mieć co najmniej 12 znaków i maksymalnie 72 bajty UTF-8.
6. (Migracja istniejących danych) Przed pierwszym użyciem wykonaj kopię `data/storage.json`, uruchom:

   ```powershell
   npm run migrate:json
   ```

   Migracja sprawdza wszystkie rekordy i działa tylko na pustej tabeli. W razie błędnych danych przerywa bez częściowego importu; popraw dane lub podaj inną ścieżkę jako argument. Oryginalny plik nie jest modyfikowany.
7. Uruchom serwer poleceniem `npm start`. Pierwszy start tworzy brakujące tabele. Lokalnie otwórz `http://localhost:3000`.
8. Na komputerach pozostałych użytkowników otwórz `http://ADRES-IP-SERWERA:3000`. Zezwól na przychodzący ruch TCP 3000 w Zaporze systemu Windows **tylko dla profilu i zakresu lokalnej sieci firmowej**. Nie otwieraj portu PostgreSQL `5432` dla sieci — baza powinna akceptować połączenia wyłącznie lokalnie.

Po weryfikacji serwera można uruchamiać go w tle przez `start-app.vbs`. Na produkcyjnym komputerze serwerowym zalecane jest skonfigurowanie automatycznego startu Node.js po restarcie systemu za pomocą Menedżera zadań Windows lub usługi.

## Współbieżność i dostęp

Każdy użytkownik ma własne konto i sesję. Zmiany są zapisywane we wspólnej bazie, a lista odświeża się automatycznie co 30 sekund. Zmiany tego samego rekordu są chronione numerem wersji; jeśli inna osoba edytowała go wcześniej, aplikacja odrzuci nieaktualny zapis zamiast po cichu nadpisać cudze dane. Operacje przesyłki i jej pozycji oraz pełny import Excela są transakcyjne.

Każda przesyłka otrzymuje stały Numer ID w formacie `001/2026`. Licznik rozpoczyna się osobno dla każdego roku daty przyjęcia, a numer nie zmienia się po późniejszej korekcie daty. Numer jest uwzględniany w eksporcie Excel i zachowywany przy ponownym imporcie; starsze arkusze bez tej kolumny otrzymują numery automatycznie.

Przy wprowadzaniu przesyłki można wybrać nazwę spółki z listy. Opcja „inna” pozwala wpisać własną nazwę; jest ona zapisywana, wyświetlana w tabeli i uwzględniana w wyszukiwaniu oraz eksporcie.

Domyślna konfiguracja jest przeznaczona wyłącznie dla zaufanej sieci lokalnej: HTTP nie szyfruje haseł ani sesji. Nie wystawiaj portu aplikacji do Internetu. Jeśli dostęp ma wychodzić poza zaufaną sieć, skonfiguruj HTTPS przez reverse proxy, ustaw `COOKIE_SECURE=true` oraz `TRUST_PROXY=1` i ogranicz dostęp zaporą.

## Kopie zapasowe

Przechowuj kopie poza komputerem serwerowym i regularnie testuj odtwarzanie. Zainstaluj narzędzia wiersza poleceń PostgreSQL (w tym `pg_dump` i `pg_restore`) razem z serwerem lub dodaj ich katalog `bin` do zmiennej `PATH`. W PowerShell:

```powershell
New-Item -ItemType Directory -Force backups
pg_dump --format=custom --file=backups\magazyn.dump "$env:DATABASE_URL"
```

Odtworzenie kopii wymaga pustej bazy docelowej:

```powershell
pg_restore --clean --if-exists --dbname="$env:DATABASE_URL" backups\magazyn.dump
```

## Rozwój i testy

```powershell
npm test
npm start
```

Zmiany schematu dodawaj jako kolejne uporządkowane pliki SQL w `migrations/`. Aplikacja wykona je przy starcie, z zapisem zastosowanych migracji w bazie.
