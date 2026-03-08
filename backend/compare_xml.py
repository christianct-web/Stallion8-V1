#!/usr/bin/env python3
import requests
import xml.etree.ElementTree as ET
import sys

# Get latest XML
url = "http://localhost:8021/pack/generate"
payload = {
    "header": {
        "consignorName": "Test Exporter Inc.",
        "invoiceNumber": "INV-001",
        "invoiceDate": "2026-02-19",
        "consigneeCode": "TEST001",
        "consigneeName": "Test Consignee Ltd.",
        "consigneeAddress": "123 Test Street\nTest City",
        "port": "TTPTS",
        "term": "CIF",
        "modeOfTransport": "Sea",
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

response = requests.post(url, json=payload, timeout=30)
result = response.json()

if result.get("status") == "generated":
    docs = result.get("documents", [])
    xml_doc = next((d for d in docs if d.get("name") == "c82_sad_xml"), None)
    if xml_doc:
        xml_url = f"http://localhost:8021{xml_doc.get('url')}"
        xml_resp = requests.get(xml_url, timeout=10)
        if xml_resp.status_code == 200:
            xml_content = xml_resp.text
            print("=== Current XML Structure ===")
            root = ET.fromstring(xml_content)
            
            # Print top-level elements
            print("\nTop-level elements in generated XML:")
            for child in root:
                print(f"  <{child.tag}>")
                
            # Compare with ACE example structure
            ace_structure = [
                "Assessment_notice",
                "Global_taxes", 
                "Property",
                "Identification",
                "Traders",
                "Declarant",
                "General_information",
                "Transport",
                "Financial",
                "Warehouse",
                "Transit",
                "Valuation",
                "Container",
                "Item",
                "Suppliers_documents"
            ]
            
            print("\n=== Missing from ACE structure ===")
            generated_tags = {child.tag for child in root}
            ace_tags = set(ace_structure)
            
            missing_from_generated = ace_tags - generated_tags
            extra_in_generated = generated_tags - ace_tags
            
            if missing_from_generated:
                print("Missing elements:")
                for tag in sorted(missing_from_generated):
                    print(f"  - <{tag}>")
            
            if extra_in_generated:
                print("\nExtra elements in our XML:")
                for tag in sorted(extra_in_generated):
                    print(f"  - <{tag}>")
            
            # Check specific sections
            print("\n=== Key Checks ===")
            
            # Check Property
            property_elem = root.find("Property")
            if property_elem is not None:
                print("Property section exists")
                for child in property_elem:
                    print(f"  Property child: <{child.tag}>")
            
            # Check Valuation
            valuation = root.find("Valuation")
            if valuation is not None:
                print("Valuation section exists")
                # Check for gs_* elements
                gs_elements = [e for e in valuation if e.tag.startswith("Gs_")]
                print(f"  Found {len(gs_elements)} Gs_* elements")
            
            # Check Container
            container = root.find("Container")
            if container is not None:
                print("Container section exists")
                for child in container:
                    print(f"  Container child: <{child.tag}>")
            else:
                print("Container section MISSING (expected for containerized cargo)")
                
        else:
            print(f"Failed to download XML: {xml_resp.status_code}")
    else:
        print("No XML document found")
else:
    print(f"Generation failed: {result}")