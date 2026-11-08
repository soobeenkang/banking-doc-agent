import json, sys
d = json.load(open(sys.argv[1]))
ie = d['workflowConfig']['informationExtractConfiguration']
ko2en = {v: k for k, v in ie['categorySchemaMapping'].items()}

S5 = {'rrn'}
S4 = {'balance','original_amount','other_loan_total','other_secured_loan_total','lien_amount','overdue_principal','overdue_interest'}
S3 = {'birth_date','phone_mobile','phone_work','email','business_reg_no','payer_reg_no','annual_income','monthly_income',
      'total_determined_tax','determined_tax','income_amount','total_paid','interest_rate','appraisal_value','license_no',
      'sales_total','sales_taxable','sales_exempt','tax_payable'}
S2 = {'name','representative','household_head_name','co_owner','collateral_owner','address','business_address','work_address','loan_amount','loan_purpose'}
S1 = {'company_name','business_name','business_category','business_item','department','position','job_duty','payer_name'}
OVERRIDE0 = {'officer_name','officer_phone'}  # 세무서 담당 공무원 정보: 고객 민감정보 아님
ID  = {'rrn','name','birth_date','phone_mobile','phone_work','email','address','business_address','work_address','household_head_name','collateral_owner','co_owner','representative'}
BIZ = {'business_name','business_reg_no','business_category','business_item','sales_total','sales_taxable','sales_exempt','tax_payable','payer_name','payer_reg_no'}
FIN = {'annual_income','monthly_income','total_determined_tax','determined_tax','income_amount','total_paid','balance','original_amount',
       'other_loan_total','other_secured_loan_total','interest_rate','appraisal_value','lien_amount','overdue_principal','overdue_interest'}

def sens(k):
    if k in OVERRIDE0: return 0
    if k in S5: return 5
    if k in S4: return 4
    if k in S3 or k.startswith('income_') and k not in ('income_year','income_type','income_category','income_earner_type') or k.startswith('revenue_'): return 3
    if k in S2: return 2
    if k in S1: return 1
    return 0
def grp(k):
    if k in OVERRIDE0: return None
    if k in ID: return 'ID'
    if k in BIZ: return 'BIZ'
    if k in FIN or (k.startswith('income_') and sens(k) == 3) or k.startswith('revenue_'): return 'FIN'
    return None

rows = []
for s in ie['schemas']:
    doc = ko2en[s['json_schema']['name']]
    for k, v in s['json_schema']['schema'].get('properties', {}).items():
        k = k.strip()
        if v.get('type') == 'array' and 'items' in v:
            for kk in v['items'].get('properties', {}):
                rows.append((doc, f'{k}[].{kk}', sens(kk), grp(kk)))
        else:
            rows.append((doc, k, sens(k), grp(k)))

q = lambda x: 'NULL' if x is None else "'" + x.replace("'", "''") + "'"
print('-- field_catalog 초기값: 워크플로우 1 Extract 스키마 10종의 모든 필드')
print('-- sensitivity 0 = 위험도 계산 제외, 1~5 = 민감도. risk_group = 조합 위험 그룹(ID/FIN/BIZ)')
print('-- 이미 있는 행은 덮어쓰지 않는다(운영 중 수정한 값 보존). 초기화하려면 DO NOTHING을 DO UPDATE로 바꿔 실행.')
print('INSERT INTO field_catalog (doc_type, field_path, sensitivity, risk_group) VALUES')
print(',\n'.join(f'  ({q(a)}, {q(b)}, {c}, {q(g)})' for a, b, c, g in rows))
print('ON CONFLICT (doc_type, field_path) DO NOTHING;')
print(f'-- {len(rows)} rows', file=sys.stderr)
