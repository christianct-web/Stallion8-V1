#!/usr/bin/env python3
import json
import requests
import sys

# Test payload matching the updated validation
payload = {
    "header": {
        "consignorName": "Test Exporter Inc.",
        "consignorAddress": "123 Exporter Street\nExporter City",
        "consignorStreet": "123 Exporter Street",
        "consignorCity": "Exporter City",
        "consignorCountry": "United States",
        "invoiceNumber": "INV-001",
        "invoiceDate": "2026-02-19",
        "consigneeCode": "TEST001",
        "consigneeName": "Test Consignee Ltd.",
        "consigneeAddress": "123 Test Street\nTest City",
        "port": "TTPTS",
        "modeOfTransport": "Sea",
        "term": "CIF",
        "customsRegime": "C4",
        "declarantTIN": "DEC001",
        "declarantName": "Test Declarant",
        "declarationRef": "DECREF001",
        "countryFirstDestination": "US",
        "tradingCountry": "US",
        "exportCountryCode": "US",
        "exportCountryName": "United States",
        "countryOfOriginName": "United States",
        "blAwbNumber": "TSCW16401583",
        "blAwbDate": "2026-02-19",
        "etaDate": "2026-02-20",
        "currency": "USD",
        "vesselName": "TEST VESSEL",
        "bankCode": 1,
        "modeOfPayment": "CASH",
        "termsCode": 99,
        "termsDescription": "Basic"
    },
    "worksheet": {
        "fob_foreign": 10000.00,
        "freight_foreign": 500.00,
        "insurance_foreign": 200.00,
        "other_foreign": 0.00,
        "deduction_foreign": 0.00,
        "cif_foreign": 10700.00,
        "cif_local": 10700.00,
        "exchange_rate": 1.0,
        "duty_rate_pct": 10.0,
        "surcharge_rate_pct": 5.0,
        "vat_rate_pct": 12.5,
        "extra_fees_local": 50.00,
        "duty": 1070.00,
        "surcharge": 535.00,
        "vat": 1343.75,
        "total_assessed": 2998.75,
        "grossWeight": 1500.0,
        "customs_user_fee": 25.00,
        "ces_fees": 15.00
    },
    "items": [
        {
            "hsCode": "02071490",
            "description": "BONELESS SKINLESS CHICKEN BREAST FILETS",
            "itemValue": 10700.00,
            "qty": 100,
            "grossKg": 1500.0,
            "netKg": 1350.0,
            "packageType": "CS",
            "packageTypeName": "Case",
            "countryOfOrigin": "US",
            "marks1": "AS ADDRESSED",
            "blAwbNumber": "TSCW16401583",
            "extendedCustomsProcedure": 4000,
            "nationalCustomsProcedure": 0,
            "quotaCode": "NEW",
            "valuationMethodCode": "",
            "rateOfAdjustment": 1,
            "statisticalValue": 10700.00,
            "itemValueLocal": 10700.00,
            "currency": "USD",
            "exchangeRate": 1.0
        }
    ],
    "containers": [
        {
            "containerNo": "TEST1234567",
            "type": "40GP",
            "efIndicator": "FCL",
            "description": "BONELESS SKINLESS CHICKEN",
            "packageType": "CS",
            "packages": 100,
            "goodsWeight": 1500.0
        }
    ]
}

# Send to backend
url = "http://localhost:8021/pack/generate"
print(f"Sending test payload to {url}")

try:
    response = requests.post(url, json=payload, timeout=30)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    
    try:
        result = response.json()
        print("\nResponse JSON:")
        print(json.dumps(result, indent=2))
        
        if result.get("status") == "blocked":
            print("\n=== Validation Errors ===")
            for error in result.get("preflight", {}).get("errors", []):
                print(f"Error: {error}")
            for warning in result.get("preflight", {}).get("warnings", []):
                print(f"Warning: {warning}")
                
    except json.JSONDecodeError:
        print(f"Response text: {response.text[:500]}")
        
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
    sys.exit(1)
        
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
    sys.exit(1)