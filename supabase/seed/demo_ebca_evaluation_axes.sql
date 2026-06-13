-- ============================================================================
-- demo_ebca_evaluation_axes.sql
--
-- 用途: デモ企業「テスト株式会社」(company_id = 7a58cc1b-9f81-4da5-ae2c-fd3abea05c33,
--       companies.is_demo = true) の既存 interview_results 7件に、
--       Evidence-based Competency Analysis（エビデンスベース・コンピテンシー分析）形式の
--       evaluation_axes（jsonb）をデモデータとして付与する SEED スクリプト。
--
-- 【重要】
--   * これは MIGRATION ではない。supabase/migrations には置かない（本番自動適用しない）。
--   * 手動実行専用（運用者が Supabase SQL Editor / psql で意図的に流す）。
--   * デモ企業（is_demo = true）の applicants に紐づく interview_results のみを対象とする。
--     通常企業・本番企業・E2E用「テスト登録株式会社」(is_demo = false) には一切影響しない。
--   * 各 UPDATE は interview_results.id を直接指定し、かつ「デモ企業の応募者」であることを
--     サブクエリで二重に保証する。再実行しても同じ JSON を再設定するだけ（冪等に近い）。
--   * 課金には触れない: interviews.is_billable は変更しない（このスクリプトは interview_results のみ）。
--   * evaluation_axes スキーマ（docs/API_DESIGN.md CLI-006 / REQUIREMENTS F-R-002）:
--       [{ axis, label, score(0-20 or null), rank(A-E or null),
--          evidence: string[], confidence: 'high'|'medium'|'low',
--          insufficient_reason: string|null }]
--     6軸キー = communication / logical_thinking / initiative / desire / stress_tolerance / integrity
--     判断材料不足の軸は score=null / rank=null / evidence=[] / confidence='low' / insufficient_reason あり。
--
-- 投入対象: interview_results 7件（既存。evaluation_axes は現状すべて null）。
--           total_score / summary_text / feedback_text / strengths / improvement_points と整合させた内容。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) total_score=88 / rank=A / 革新型リーダー
--    強み: リーダーシップ・コミュニケーション力・挑戦意欲・チームビルディング / 改善: 細部への注意力
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":18,"rank":"A","evidence":["チームに好影響を与えるコミュニケーション能力が際立つと評価された"],"confidence":"high","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":16,"rank":"B","evidence":["施策の意図を筋道立てて説明できていた"],"confidence":"high","insufficient_reason":null},
  {"axis":"initiative","label":"主体性・行動力","score":18,"rank":"A","evidence":["挑戦意欲を持ちチームビルディングを自ら牽引した経験を語った"],"confidence":"high","insufficient_reason":null},
  {"axis":"desire","label":"志望度・意欲","score":17,"rank":"A","evidence":["役割への高い意欲が回答全体に表れていた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":16,"rank":"B","evidence":["難局でも落ち着いてチームをまとめた経験を述べた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":17,"rank":"A","evidence":["回答に一貫性があり誇張は見られなかった"],"confidence":"high","insufficient_reason":null}
]'::jsonb
WHERE id = 'ec36131b-16c7-4219-b103-0b4803502f10'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- ---------------------------------------------------------------------------
-- 2) total_score=82 / rank=B / 堅実型プレイヤー
--    強み: 正確性と丁寧さ・責任感・継続力 / 改善: 主体性の発揮・変化への適応力
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":15,"rank":"B","evidence":["要点を丁寧に伝える受け答えができていた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":16,"rank":"B","evidence":["正確性を重視し筋道立てて説明していた"],"confidence":"high","insufficient_reason":null},
  {"axis":"initiative","label":"主体性・行動力","score":12,"rank":"C","evidence":["指示された業務は確実だが自発的な提案は限定的だった"],"confidence":"high","insufficient_reason":null},
  {"axis":"desire","label":"志望度・意欲","score":15,"rank":"B","evidence":["業務への責任感と継続して取り組む姿勢が見られた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":13,"rank":"B","evidence":["変化への適応にはやや時間を要する旨の発言があった"],"confidence":"medium","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":18,"rank":"A","evidence":["正確性と丁寧さ、責任感の強さが一貫して語られた"],"confidence":"high","insufficient_reason":null}
]'::jsonb
WHERE id = '8a27056d-5dc4-44b8-be29-7fb83390c914'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- ---------------------------------------------------------------------------
-- 3) total_score=78 / rank=B / 実行型リーダー
--    強み: 数値に基づく説明力・課題解決への主体性・マネジメント経験 / 改善: キャリアビジョン不明確・チームワーク具体性不足
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":16,"rank":"B","evidence":["具体的な数値を交えて簡潔に回答していた"],"confidence":"high","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":16,"rank":"B","evidence":["課題→施策→結果の構造で論理的に説明できていた"],"confidence":"high","insufficient_reason":null},
  {"axis":"initiative","label":"主体性・行動力","score":16,"rank":"B","evidence":["人手不足の店舗で採用プロセスを自ら見直した経験を述べた"],"confidence":"high","insufficient_reason":null},
  {"axis":"desire","label":"志望度・意欲","score":12,"rank":"C","evidence":["志望は語るが3〜5年後のキャリアビジョンは曖昧だった"],"confidence":"medium","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":14,"rank":"B","evidence":["困難な店舗状況でも冷静に改善を進めた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":14,"rank":"B","evidence":["実績の説明に矛盾は見られなかった"],"confidence":"medium","insufficient_reason":null}
]'::jsonb
WHERE id = '5c140400-0f0c-410d-8827-892dfca7ce9a'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- ---------------------------------------------------------------------------
-- 4) total_score=73 / rank=C / バランス型 ★判断材料不足デモ★
--    面接の発言量が少なく、一部の軸は根拠が得られず「判断材料不足」とする。
--    logical_thinking と initiative を score=null / confidence=low / insufficient_reason あり にする。
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":12,"rank":"C","evidence":["基本的な受け答えはできていた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":null,"rank":null,"evidence":[],"confidence":"low","insufficient_reason":"回答が短く、論理構成を判断できる発言が十分に得られなかった"},
  {"axis":"initiative","label":"主体性・行動力","score":null,"rank":null,"evidence":[],"confidence":"low","insufficient_reason":"自ら行動した具体的な経験への言及が得られなかった"},
  {"axis":"desire","label":"志望度・意欲","score":11,"rank":"C","evidence":["志望動機に一定の関心は見られた"],"confidence":"low","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":12,"rank":"C","evidence":["落ち着いた対応はできていた"],"confidence":"low","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":12,"rank":"C","evidence":["回答に矛盾は見られなかった"],"confidence":"medium","insufficient_reason":null}
]'::jsonb
WHERE id = 'e9e390a4-7c4f-4528-8c19-70ce6a8961f4'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- ---------------------------------------------------------------------------
-- 5) total_score=71 / rank=C / 慎重型分析家
--    強み: 分析力・リスク管理能力・正確な作業 / 改善: 積極性の不足・コミュニケーションの消極性
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":10,"rank":"C","evidence":["受け答えはやや消極的で簡潔だった"],"confidence":"medium","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":15,"rank":"B","evidence":["分析力を活かし筋道立てて状況を整理していた"],"confidence":"high","insufficient_reason":null},
  {"axis":"initiative","label":"主体性・行動力","score":9,"rank":"C","evidence":["積極的に提案する姿勢はやや不足していた"],"confidence":"high","insufficient_reason":null},
  {"axis":"desire","label":"志望度・意欲","score":12,"rank":"C","evidence":["業務への関心は一定程度示された"],"confidence":"medium","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":13,"rank":"B","evidence":["リスク管理を重視し冷静に対応する旨を述べた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":15,"rank":"B","evidence":["正確な作業を重んじる一貫した姿勢が見られた"],"confidence":"high","insufficient_reason":null}
]'::jsonb
WHERE id = '18524b07-10e3-48f2-ad83-7ae1830f4d1c'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- ---------------------------------------------------------------------------
-- 6) total_score=70 / rank=C / バランス型（全軸採点・中〜低信頼。No.4 の判断材料不足と対比）
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":12,"rank":"C","evidence":["基本的なコミュニケーションは取れていた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":11,"rank":"C","evidence":["要点は伝わるが具体的な根拠はやや不足していた"],"confidence":"low","insufficient_reason":null},
  {"axis":"initiative","label":"主体性・行動力","score":11,"rank":"C","evidence":["指示された範囲での行動が中心だった"],"confidence":"low","insufficient_reason":null},
  {"axis":"desire","label":"志望度・意欲","score":11,"rank":"C","evidence":["一定の関心は示された"],"confidence":"low","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":12,"rank":"C","evidence":["落ち着いて受け答えしていた"],"confidence":"low","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":12,"rank":"C","evidence":["回答に矛盾は見られなかった"],"confidence":"medium","insufficient_reason":null}
]'::jsonb
WHERE id = 'f4fab1bd-66a3-4c76-8b53-38d405aa7c9b'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- ---------------------------------------------------------------------------
-- 7) total_score=65 / rank=C / 安定型実務家
--    強み: ストレス耐性・安定した業務遂行・忍耐力 / 改善: 自発的な提案力・チーム内での発信力
-- ---------------------------------------------------------------------------
UPDATE interview_results SET evaluation_axes = '[
  {"axis":"communication","label":"コミュニケーション力","score":11,"rank":"C","evidence":["チーム内での発信はやや控えめだった"],"confidence":"medium","insufficient_reason":null},
  {"axis":"logical_thinking","label":"論理的思考力","score":12,"rank":"C","evidence":["業務手順は整理して説明できていた"],"confidence":"medium","insufficient_reason":null},
  {"axis":"initiative","label":"主体性・行動力","score":9,"rank":"C","evidence":["自発的な提案力に課題が見られた"],"confidence":"high","insufficient_reason":null},
  {"axis":"desire","label":"志望度・意欲","score":12,"rank":"C","evidence":["安定して業務に取り組む意欲が示された"],"confidence":"medium","insufficient_reason":null},
  {"axis":"stress_tolerance","label":"ストレス耐性・柔軟性","score":17,"rank":"A","evidence":["ストレス耐性が高く忍耐強く業務を遂行できると評価された"],"confidence":"high","insufficient_reason":null},
  {"axis":"integrity","label":"誠実性・一貫性","score":13,"rank":"B","evidence":["安定した業務遂行に一貫性が見られた"],"confidence":"medium","insufficient_reason":null}
]'::jsonb
WHERE id = '6c478dd1-165b-41db-8494-8cdf0917ac49'
  AND applicant_id IN (
    SELECT a.id FROM applicants a JOIN companies c ON c.id = a.company_id WHERE c.is_demo = true
  );

-- 確認用（任意・実行後にコメントアウトを外して結果を目視）:
-- SELECT ir.id, ir.total_score, jsonb_array_length(ir.evaluation_axes) AS axes
--   FROM interview_results ir
--   JOIN applicants a ON a.id = ir.applicant_id
--   JOIN companies c ON c.id = a.company_id
--  WHERE c.is_demo = true;

COMMIT;
