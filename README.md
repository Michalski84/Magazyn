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

   Hasło jest wprowadzane bez wyświetlania na ekranie; musi mieć co najmniej 12 znaków i maksymalnie 72 bajty UTF-8. Opcjonalny drugi argument to rola: `admin` (domyślnie), `warehouse` (magazyn i przesyłki, bez zapisu w kartotekach) lub `viewer` (tylko odczyt), np. `npm run create-user -- jan viewer`. Istniejące konta po aktualizacji mają rolę `admin`. Administrator widzi zakładkę **Dziennik zmian** (kto i kiedy zmienił dane oraz logowania).
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

## Moduł Magazyn

Zakładka **Magazyn** prowadzi kartotekę towarów i historię ruchów. Magazyn główny jest nieusuwalny; można tworzyć dodatkowe magazyny przypisane do spółki, zmieniać ich nazwy i usuwać je. Przy usuwaniu dodatkowego magazynu jego pozostały stan jest przenoszony do magazynu głównego, a historia zostaje zachowana.

W formularzu przesyłki pole **Magazyn docelowy** ma dwie opcje: „Przyjmij na magazyn główny” i „Nie przyjmuj na magazyn”. Każda pozycja przesyłki tworzy osobną, niezależną partię magazynową (numer zamówienia, projektu i dostawca); zmiana lub usunięcie przesyłki nie zmienia stanu magazynu. Spółka z przesyłki jest zakładana w kartotece, jeśli jeszcze nie istnieje. Starsze przesyłki, w tym importowane, nie zmieniają stanu wstecz — dla takiej przesyłki dostępna jest akcja **Przyjmij do magazynu**. Towar dodany ręcznie zaczyna od stanu zerowego; stan początkowy wprowadza się korektą z podaniem przyczyny.

WZ zatwierdza wydanie natychmiast i atomowo sprawdza dostępny stan wybranej partii; jeden dokument może obejmować towar tylko jednej spółki. Dokument ma numer `WZ/RRRR/NNNN`, można go wydrukować lub anulować (anulowanie zapisuje ruch zwrotny). Korekty stanu wymagają podania przyczyny i nie mogą obniżyć stanu poniżej zera. Tabela magazynu pokazuje partie osobno wraz z magazynem, LP, dostawcą (nadawcą przesyłki), numerami zamówienia i projektu, przyjęciami, wydaniami i stanem; stany można wyeksportować do Excela.

Tabela stanów ma kolumnę **Spółka** z filtrem oraz ptaszki zaznaczania. Zaznaczone pozycje można zamienić na WZ (jedna spółka i jeden magazyn), na przesunięcie MM (jeden magazyn źródłowy) lub wyeksportować do Excela. Przed zatwierdzeniem WZ pokazywany jest podgląd dokumentu, a lista dokumentów WZ ma filtry (numer, odbiorca, projekt, daty, status).

Ruchy są historią źródłową, a stan wylicza się z ich sumy. Przyjęcia z przesyłek są przechowywane w magazynie jako niezależne partie; numer przesyłki, dostawca i pozycje nie są połączone kluczami z rejestrem przesyłek. Import zastępujący rejestr jest blokowany, gdy istnieją ruchy magazynowe. Migracja `010_single_main_warehouse.sql` scalała wcześniejsze magazyny z głównym; migracja `011_managed_warehouses_and_detached_shipments.sql` dodaje zarządzanie magazynami i usuwa powiązania partii z pozycjami przesyłek.

Pliki magazynu są rozdzielone na moduły w `server/warehouse/` (logika operacji i transakcji) oraz `src/warehouse/` (interfejs zakładki), a migracje pozostają w `migrations/`. Logi serwera mają wspólny format czasu, poziomu i kontekstu przez `server/logger.js`; błędy żądań zawierają status, komunikat, a dla błędów serwera także stos. Są wypisywane na konsolę i zapisywane w dziennych plikach `logs/app-RRRR-MM-DD.log`; przy uruchomieniu usuwane są pliki aplikacji starsze niż 30 dni, a pliki logów są wykluczone z repozytorium.

## Struktura projektu

- `server.js` – punkt wejścia (migracje, start i zamykanie serwera).
- `server/app.js` – konfiguracja Express (zabezpieczenia, sesje, montowanie tras, pliki statyczne).
- `server/http/` – wspólne middleware i konfiguracja HTTP.
- `server/routes/` – trasy API: `auth`, `shipments`, `catalogs`, `warehouse`.
- `server/catalogs/` – słowniki spółek, odbiorców i projektów (`companies`, `recipients`, `projects`, `validation`; `index.js` udostępnia API i usuwanie).
- `server/warehouse/` – logika magazynu: `warehouses`, `items`, `stock`, `issues` (WZ), `transfers` (MM), `adjustments` (KOR), `receiving` (PZ) oraz wspólne `validation` i `ledger`; `index.js` udostępnia publiczne API.
- `src/shared/` – klient API i wspólny interfejs (toast, motyw, przewijanie).
- `src/shipments/`, `src/warehouse/`, `src/catalogs/` – skrypty poszczególnych zakładek; pliki ładowane są w kolejności z `index.htm`, a `main.js` w każdym module podłącza zdarzenia po załadowaniu strony.
- `src/styles/` – style podzielone na pliki; kolejność w `index.htm` jest istotna dla kaskady CSS.

## Kartoteki

Zakładki **Spółki**, **Odbiorcy** i **Lista projektów** pozwalają dodawać oraz edytować dane. Adresy spółek są wykorzystywane jako dane sprzedawcy WZ, a adresy i dane kontaktowe odbiorców jako dane odbiorcy. Dokument WZ zapisuje kopię tych danych, dzięki czemu późniejsze zmiany kartoteki nie zmieniają wydrukowanych wcześniej dokumentów. Numer projektu na liście pokazuje nazwę skróconą po najechaniu kursorem.

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

Testy: `test/validation.test.js` (walidacja), `test/warehouse.test.js` i `test/roles.test.js` (logika magazynu oraz role/dziennik zmian na tymczasowym schemacie PostgreSQL `test_*` tworzonym z `DATABASE_URL`; bez bazy są pomijane) oraz `test/client.test.js` (interfejs w jsdom).
