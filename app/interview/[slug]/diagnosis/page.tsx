'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

// 動物キャラクターSVGアイコンコンポーネント（ゆるキャラ・LINEスタンプ風）
function LionIcon({ className }: { className?: string }) {
  // たてがみ用の12個の三角形の座標を計算
  const maneTriangles = []
  const faceRadius = 38
  const maneRadius = 58
  const centerX = 60
  const centerY = 60
  
  for (let i = 0; i < 12; i++) {
    const angle1 = (i * 30 - 90) * (Math.PI / 180)
    const angle2 = ((i + 1) * 30 - 90) * (Math.PI / 180)
    const x1 = centerX + faceRadius * Math.cos(angle1)
    const y1 = centerY + faceRadius * Math.sin(angle1)
    const x2 = centerX + faceRadius * Math.cos(angle2)
    const y2 = centerY + faceRadius * Math.sin(angle2)
    const midAngle = (angle1 + angle2) / 2
    const x3 = centerX + maneRadius * Math.cos(midAngle)
    const y3 = centerY + maneRadius * Math.sin(midAngle)
    maneTriangles.push(`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} Z`)
  }

  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* たてがみ（12個の三角形を放射状に配置） */}
      {maneTriangles.map((path, i) => (
        <path key={i} d={path} fill="#E67E22" />
      ))}
      
      {/* 顔 */}
      <circle cx="60" cy="60" r="38" fill="#F39C12" />
      
      {/* 耳（たてがみの上部に小さな半円2つ） */}
      <path d="M 42 25 Q 42 15 52 15 Q 52 25 42 25" fill="#E67E22" />
      <path d="M 78 25 Q 78 15 68 15 Q 68 25 78 25" fill="#E67E22" />
      <path d="M 42 25 Q 42 20 47 20 Q 47 25 42 25" fill="#F39C12" />
      <path d="M 78 25 Q 78 20 73 20 Q 73 25 78 25" fill="#F39C12" />
      
      {/* まゆげ */}
      <line x1="40" y1="50" x2="56" y2="50" stroke="#333" strokeWidth="3" strokeLinecap="round" />
      <line x1="64" y1="50" x2="80" y2="50" stroke="#333" strokeWidth="3" strokeLinecap="round" />
      
      {/* 目（大きな白い楕円の中に大きな黒い丸、その中に白い小さなハイライト2つ） */}
      <ellipse cx="48" cy="58" rx="14" ry="12" fill="#fff" />
      <ellipse cx="72" cy="58" rx="14" ry="12" fill="#fff" />
      <circle cx="48" cy="58" r="9" fill="#333" />
      <circle cx="72" cy="58" r="9" fill="#333" />
      {/* 白いハイライト（左上と右下） */}
      <circle cx="45" cy="55" r="2.5" fill="#fff" />
      <circle cx="50" cy="61" r="2" fill="#fff" />
      <circle cx="69" cy="55" r="2.5" fill="#fff" />
      <circle cx="74" cy="61" r="2" fill="#fff" />
      
      {/* ほっぺ（左右にピンクの小さな円） */}
      <circle cx="30" cy="70" r="5" fill="#FFB6C1" />
      <circle cx="90" cy="70" r="5" fill="#FFB6C1" />
      
      {/* 鼻（小さな逆三角形、茶色） */}
      <polygon points="60,72 55,80 65,80" fill="#8B4513" />
      
      {/* 口（にっこりカーブ、太め線） */}
      <path d="M 50 85 Q 60 92 70 85" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
      
      {/* ネクタイ（青色、顔の下にはっきり見えるサイズ） */}
      <rect x="52" y="90" width="16" height="22" fill="#2563EB" rx="1" />
      <polygon points="60,90 76,100 44,100" fill="#2563EB" />
      <line x1="60" y1="93" x2="60" y2="112" stroke="#fff" strokeWidth="2" opacity="0.6" />
      
      {/* キラキラ */}
      <text x="15" y="30" fontSize="14" fill="#FFD700">★</text>
      <text x="100" y="25" fontSize="12" fill="#FFD700">★</text>
      <text x="10" y="90" fontSize="10" fill="#FFD700">★</text>
    </svg>
  )
}

function FoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 顔 */}
      <ellipse cx="60" cy="65" r="45" ry="40" fill="#FF8C42" />
      {/* 耳 */}
      <polygon points="40,30 50,10 60,30" fill="#FF8C42" />
      <polygon points="60,30 70,10 80,30" fill="#FF8C42" />
      <polygon points="45,28 52,18 58,28" fill="#FFB380" />
      <polygon points="62,28 68,18 75,28" fill="#FFB380" />
      {/* 目 */}
      <circle cx="50" cy="60" r="8" fill="#fff" />
      <circle cx="70" cy="60" r="8" fill="#fff" />
      <circle cx="50" cy="60" r="5" fill="#333" />
      <circle cx="70" cy="60" r="5" fill="#333" />
      <circle cx="51" cy="58" r="2" fill="#fff" />
      <circle cx="71" cy="58" r="2" fill="#fff" />
      {/* 鼻 */}
      <ellipse cx="60" cy="75" rx="5" ry="4" fill="#333" />
      {/* 口 */}
      <path d="M 55 80 Q 60 85 65 80" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* メガネ */}
      <circle cx="50" cy="60" r="15" fill="none" stroke="#4A5568" strokeWidth="2.5" />
      <circle cx="70" cy="60" r="15" fill="none" stroke="#4A5568" strokeWidth="2.5" />
      <line x1="65" y1="60" x2="55" y2="60" stroke="#4A5568" strokeWidth="2.5" />
      {/* キラキラ */}
      <text x="25" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="95" y="25" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function DolphinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 体 */}
      <ellipse cx="60" cy="65" r="50" ry="38" fill="#87CEEB" />
      {/* 背びれ */}
      <ellipse cx="60" cy="35" rx="12" ry="20" fill="#5F9EA0" />
      {/* 目 */}
      <circle cx="50" cy="60" r="5" fill="#fff" />
      <circle cx="70" cy="60" r="5" fill="#fff" />
      <circle cx="50" cy="60" r="3" fill="#333" />
      <circle cx="70" cy="60" r="3" fill="#333" />
      <circle cx="51" cy="59" r="1" fill="#fff" />
      <circle cx="71" cy="59" r="1" fill="#fff" />
      {/* 口 */}
      <path d="M 35 75 Q 50 85 60 80" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* ヘッドセット */}
      <circle cx="60" cy="50" r="28" fill="none" stroke="#4A5568" strokeWidth="3" />
      <rect x="32" y="47" width="56" height="6" fill="#4A5568" rx="3" />
      {/* キラキラ */}
      <text x="20" y="30" fontSize="10" fill="#87CEEB">★</text>
      <text x="100" y="40" fontSize="12" fill="#87CEEB">★</text>
    </svg>
  )
}

function EagleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 顔 */}
      <circle cx="60" cy="60" r="45" fill="#D4A574" />
      {/* くちばし */}
      <polygon points="60,35 72,55 60,60 48,55" fill="#FF8C42" />
      {/* 目 */}
      <circle cx="50" cy="55" r="8" fill="#fff" />
      <circle cx="70" cy="55" r="8" fill="#fff" />
      <circle cx="50" cy="55" r="5" fill="#333" />
      <circle cx="70" cy="55" r="5" fill="#333" />
      <circle cx="51" cy="54" r="2" fill="#fff" />
      <circle cx="71" cy="54" r="2" fill="#fff" />
      {/* 羽 */}
      <ellipse cx="35" cy="60" rx="15" ry="30" fill="#8B7355" />
      <ellipse cx="85" cy="60" rx="15" ry="30" fill="#8B7355" />
      {/* 望遠鏡 */}
      <rect x="58" y="15" width="4" height="18" fill="#4A5568" />
      <rect x="56" y="13" width="8" height="3" fill="#2D3748" />
      <circle cx="60" cy="16" r="2" fill="#1A202C" />
      {/* キラキラ */}
      <text x="25" y="25" fontSize="10" fill="#FFD700">★</text>
      <text x="95" y="20" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function WolfIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 顔 */}
      <ellipse cx="60" cy="65" r="45" ry="40" fill="#C0C0C0" />
      {/* 耳 */}
      <polygon points="40,35 50,15 60,35" fill="#A0A0A0" />
      <polygon points="60,35 70,15 80,35" fill="#A0A0A0" />
      <polygon points="42,33 50,25 58,33" fill="#E0E0E0" />
      <polygon points="62,33 70,25 78,33" fill="#E0E0E0" />
      {/* 目 */}
      <circle cx="50" cy="60" r="7" fill="#fff" />
      <circle cx="70" cy="60" r="7" fill="#fff" />
      <circle cx="50" cy="60" r="5" fill="#333" />
      <circle cx="70" cy="60" r="5" fill="#333" />
      <circle cx="51" cy="58" r="2" fill="#fff" />
      <circle cx="71" cy="58" r="2" fill="#fff" />
      {/* 鼻 */}
      <ellipse cx="60" cy="75" rx="5" ry="4" fill="#333" />
      {/* 口 */}
      <path d="M 55 80 Q 60 85 65 80" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* ホイッスル */}
      <rect x="75" y="85" width="15" height="6" fill="#FFD700" rx="3" />
      <circle cx="78" cy="88" r="2" fill="#333" />
      {/* キラキラ */}
      <text x="25" y="30" fontSize="10" fill="#C0C0C0">★</text>
      <text x="95" y="35" fontSize="12" fill="#C0C0C0">★</text>
    </svg>
  )
}

function OwlIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 体 */}
      <ellipse cx="60" cy="70" r="42" ry="50" fill="#8B7355" />
      {/* 顔 */}
      <circle cx="60" cy="60" r="38" fill="#D4A574" />
      {/* 耳の羽 */}
      <ellipse cx="35" cy="35" rx="6" ry="15" fill="#8B7355" />
      <ellipse cx="85" cy="35" rx="6" ry="15" fill="#8B7355" />
      {/* 目 */}
      <circle cx="50" cy="60" r="10" fill="#fff" />
      <circle cx="70" cy="60" r="10" fill="#fff" />
      <circle cx="50" cy="60" r="7" fill="#333" />
      <circle cx="70" cy="60" r="7" fill="#333" />
      <circle cx="52" cy="58" r="3" fill="#fff" />
      <circle cx="72" cy="58" r="3" fill="#fff" />
      {/* くちばし */}
      <polygon points="60,75 68,85 60,90 52,85" fill="#FF8C42" />
      {/* 本 */}
      <rect x="75" y="85" width="12" height="15" fill="#4A5568" />
      <line x1="81" y1="85" x2="81" y2="100" stroke="#fff" strokeWidth="1" />
      {/* キラキラ */}
      <text x="20" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="100" y="25" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function CheetahIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 顔 */}
      <ellipse cx="60" cy="65" r="45" ry="40" fill="#FFD89B" />
      {/* 耳 */}
      <polygon points="40,35 50,15 60,35" fill="#FFA500" />
      <polygon points="60,35 70,15 80,35" fill="#FFA500" />
      <polygon points="42,33 50,25 58,33" fill="#FFD89B" />
      <polygon points="62,33 70,25 78,33" fill="#FFD89B" />
      {/* 斑点 */}
      <circle cx="50" cy="80" r="4" fill="#333" />
      <circle cx="70" cy="85" r="3" fill="#333" />
      {/* 目 */}
      <circle cx="50" cy="60" r="7" fill="#fff" />
      <circle cx="70" cy="60" r="7" fill="#fff" />
      <circle cx="50" cy="60" r="5" fill="#333" />
      <circle cx="70" cy="60" r="5" fill="#333" />
      <circle cx="51" cy="58" r="2" fill="#fff" />
      <circle cx="71" cy="58" r="2" fill="#fff" />
      {/* 鼻 */}
      <ellipse cx="60" cy="75" rx="5" ry="4" fill="#FF8C69" />
      {/* 口 */}
      <path d="M 55 80 Q 60 85 65 80" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* スニーカー */}
      <ellipse cx="35" cy="100" rx="9" ry="6" fill="#FF6B6B" />
      <ellipse cx="85" cy="100" rx="9" ry="6" fill="#FF6B6B" />
      {/* キラキラ */}
      <text x="25" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="95" y="35" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function ElephantIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 顔 */}
      <ellipse cx="60" cy="70" r="50" ry="45" fill="#D3D3D3" />
      {/* 鼻 */}
      <ellipse cx="60" cy="95" rx="12" ry="20" fill="#C0C0C0" />
      <ellipse cx="60" cy="110" rx="6" ry="4" fill="#A0A0A0" />
      {/* 耳 */}
      <ellipse cx="25" cy="55" rx="20" ry="28" fill="#A0A0A0" />
      <ellipse cx="95" cy="55" rx="20" ry="28" fill="#A0A0A0" />
      {/* 目 */}
      <circle cx="50" cy="65" r="7" fill="#fff" />
      <circle cx="70" cy="65" r="7" fill="#fff" />
      <circle cx="50" cy="65" r="5" fill="#333" />
      <circle cx="70" cy="65" r="5" fill="#333" />
      <circle cx="51" cy="63" r="2" fill="#fff" />
      <circle cx="71" cy="63" r="2" fill="#fff" />
      {/* 救急箱 */}
      <rect x="75" y="85" width="15" height="12" fill="#EF4444" />
      <line x1="82.5" y1="85" x2="82.5" y2="97" stroke="#fff" strokeWidth="1.5" />
      <line x1="75" y1="91" x2="90" y2="91" stroke="#fff" strokeWidth="1.5" />
      {/* キラキラ */}
      <text x="20" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="100" y="25" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function SharkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 体 */}
      <ellipse cx="60" cy="65" r="55" ry="38" fill="#87CEEB" />
      {/* 尾びれ */}
      <polygon points="105,65 120,50 120,80" fill="#5F9EA0" />
      {/* 背びれ */}
      <ellipse cx="60" cy="40" rx="12" ry="20" fill="#5F9EA0" />
      {/* 目 */}
      <circle cx="50" cy="60" r="7" fill="#fff" />
      <circle cx="70" cy="60" r="7" fill="#fff" />
      <circle cx="50" cy="60" r="5" fill="#333" />
      <circle cx="70" cy="60" r="5" fill="#333" />
      <circle cx="51" cy="58" r="2" fill="#fff" />
      <circle cx="71" cy="58" r="2" fill="#fff" />
      {/* 口 */}
      <path d="M 30 80 Q 45 90 55 85" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 歯 */}
      <polygon points="35,85 40,80 45,85" fill="#fff" />
      {/* 電球 */}
      <circle cx="85" cy="45" r="9" fill="#FFD700" />
      <rect x="82" y="54" width="6" height="5" fill="#4A5568" rx="1" />
      {/* キラキラ */}
      <text x="15" y="30" fontSize="10" fill="#87CEEB">★</text>
      <text x="105" y="25" fontSize="12" fill="#87CEEB">★</text>
    </svg>
  )
}

function BeeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 体 */}
      <ellipse cx="60" cy="65" r="38" ry="45" fill="#FFD700" />
      {/* 縞模様 */}
      <line x1="30" y1="55" x2="90" y2="55" stroke="#333" strokeWidth="3" />
      <line x1="30" y1="65" x2="90" y2="65" stroke="#333" strokeWidth="3" />
      <line x1="30" y1="75" x2="90" y2="75" stroke="#333" strokeWidth="3" />
      {/* 目 */}
      <circle cx="50" cy="55" r="5" fill="#fff" />
      <circle cx="70" cy="55" r="5" fill="#fff" />
      <circle cx="50" cy="55" r="3" fill="#333" />
      <circle cx="70" cy="55" r="3" fill="#333" />
      {/* 口 */}
      <path d="M 55 75 Q 60 80 65 75" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 羽 */}
      <ellipse cx="45" cy="45" rx="12" ry="15" fill="#E0E0E0" opacity="0.7" />
      <ellipse cx="75" cy="45" rx="12" ry="15" fill="#E0E0E0" opacity="0.7" />
      {/* クリップボード */}
      <rect x="75" y="85" width="15" height="18" fill="#fff" stroke="#4A5568" strokeWidth="1.5" />
      <line x1="82.5" y1="85" x2="82.5" y2="103" stroke="#4A5568" strokeWidth="1" />
      {/* キラキラ */}
      <text x="20" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="100" y="25" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function ParrotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 体 */}
      <ellipse cx="60" cy="70" r="38" ry="42" fill="#FF6B9D" />
      {/* 頭 */}
      <circle cx="60" cy="45" r="28" fill="#FF1493" />
      {/* くちばし */}
      <polygon points="60,30 72,50 60,55 48,50" fill="#FF8C42" />
      {/* 目 */}
      <circle cx="52" cy="42" r="5" fill="#fff" />
      <circle cx="68" cy="42" r="5" fill="#fff" />
      <circle cx="52" cy="42" r="3" fill="#333" />
      <circle cx="68" cy="42" r="3" fill="#333" />
      <circle cx="53" cy="41" r="1" fill="#fff" />
      <circle cx="69" cy="41" r="1" fill="#fff" />
      {/* 羽 */}
      <ellipse cx="35" cy="70" rx="15" ry="22" fill="#FF1493" />
      <ellipse cx="85" cy="70" rx="15" ry="22" fill="#FF1493" />
      {/* パレット */}
      <circle cx="85" cy="95" r="11" fill="#fff" stroke="#4A5568" strokeWidth="1.5" />
      <circle cx="82" cy="92" r="2" fill="#FF6B9D" />
      <circle cx="88" cy="92" r="2" fill="#FFD700" />
      <circle cx="85" cy="97" r="2" fill="#87CEEB" />
      {/* キラキラ */}
      <text x="20" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="100" y="25" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

function OctopusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 頭 */}
      <circle cx="60" cy="60" r="38" fill="#FF69B4" />
      {/* 目 */}
      <circle cx="50" cy="55" r="7" fill="#fff" />
      <circle cx="70" cy="55" r="7" fill="#fff" />
      <circle cx="50" cy="55" r="5" fill="#333" />
      <circle cx="70" cy="55" r="5" fill="#333" />
      <circle cx="51" cy="53" r="2" fill="#fff" />
      <circle cx="71" cy="53" r="2" fill="#fff" />
      {/* 口 */}
      <path d="M 55 70 Q 60 75 65 70" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 足 */}
      <ellipse cx="35" cy="85" rx="6" ry="18" fill="#FF69B4" />
      <ellipse cx="50" cy="90" rx="6" ry="18" fill="#FF69B4" />
      <ellipse cx="70" cy="90" rx="6" ry="18" fill="#FF69B4" />
      <ellipse cx="85" cy="85" rx="6" ry="18" fill="#FF69B4" />
      {/* 工具 */}
      <rect x="75" y="35" width="15" height="6" fill="#4A5568" />
      <rect x="78" y="32" width="9" height="3" fill="#2D3748" />
      {/* キラキラ */}
      <text x="25" y="30" fontSize="10" fill="#FFD700">★</text>
      <text x="95" y="25" fontSize="12" fill="#FFD700">★</text>
    </svg>
  )
}

// 12タイプ定義
const PERSONALITY_TYPES = {
  lion: {
    name: 'ライオン型リーダー',
    catchphrase: '決断力と行動力でチームを導くカリスマ',
    description: 'あなたは、自然とチームの中心に立つタイプ。会議では最初に意見を言い、迷っているメンバーの背中を押すのが得意。「まずやってみよう」が口癖で、スピード感のある行動でチームを引っ張ります。',
    personalityTags: ['外向的', '主導型', '決断力', '行動派'],
    analysisText: 'あなたの強みは、決断力とチームを動かす推進力。困難な場面でもプレッシャーを力に変えて前に進めるタイプです。一方で、周囲の声にもう少し耳を傾けると、さらに信頼されるリーダーになれるかも。あなたのリーダーシップは、周りの人にとって心強い存在です！',
    radarScores: [90, 75, 85, 95, 85, 80],
    bgGradient: 'from-orange-50 to-orange-100',
    icon: LionIcon,
  },
  fox: {
    name: 'キツネ型ストラテジスト',
    catchphrase: '鋭い洞察力で最適な戦略を描く知恵者',
    description: 'あなたは内向的で主導型のタイプ。データと論理で本質を見抜き、長期的な視点で戦略を立てるのが得意です。冷静な判断力と先見の明を持っています。',
    personalityTags: ['内向的', '主導型', '分析的', '戦略的'],
    strengths: ['分析力が高い', '戦略的に考える', '冷静な判断'],
    growthAreas: ['行動のスピード', 'チームとの対話'],
    radarScores: [70, 95, 75, 85, 90, 85],
    bgGradient: 'from-amber-50 to-amber-100',
    icon: FoxIcon,
  },
  dolphin: {
    name: 'イルカ型コミュニケーター',
    catchphrase: '明るさと共感力で人を繋ぐチームの潤滑油',
    description: 'あなたは外向的で協調型のタイプ。明るく親しみやすく、周囲の人々と自然にコミュニケーションを取れます。相手の気持ちに寄り添い、チーム全体の雰囲気を良くする力があります。',
    personalityTags: ['外向的', '協調型', '共感力', 'コミュニケーション'],
    strengths: ['人を繋げる', '雰囲気を良くする', '共感力が高い'],
    growthAreas: ['論理的な思考', '厳しい判断'],
    radarScores: [95, 70, 90, 80, 75, 75],
    bgGradient: 'from-sky-50 to-sky-100',
    icon: DolphinIcon,
  },
  eagle: {
    name: 'ワシ型ビジョナリー',
    catchphrase: '高い視座で全体を見渡し未来を描く先見者',
    description: 'あなたは内向的で主導型のタイプ。高い視点から物事を見ることができ、長期的なビジョンを描くのが得意です。未来を見据えながら、組織やチームの方向性を示せます。',
    personalityTags: ['内向的', '主導型', 'ビジョン力', '先見性'],
    strengths: ['ビジョンを描く', '先を見通す', '大局観がある'],
    growthAreas: ['現実の詳細把握', 'メンバーとの距離'],
    radarScores: [80, 85, 80, 90, 80, 95],
    bgGradient: 'from-indigo-50 to-indigo-100',
    icon: EagleIcon,
  },
  wolf: {
    name: 'オオカミ型チームビルダー',
    catchphrase: '仲間を大切にし信頼で組織をまとめる絆の人',
    description: 'あなたは外向的で協調型のタイプ。チームワークを大切にし、メンバー同士の信頼関係を築くのが得意です。協調性が高く、チーム全体の結束力を高めます。',
    personalityTags: ['外向的', '協調型', '信頼性', 'チームワーク'],
    strengths: ['信頼を築く', 'チームをまとめる', '協調性が高い'],
    growthAreas: ['個人の判断', '厳しい決断'],
    radarScores: [90, 75, 95, 85, 80, 80],
    bgGradient: 'from-slate-50 to-slate-100',
    icon: WolfIcon,
  },
  owl: {
    name: 'フクロウ型アナリスト',
    catchphrase: 'データと論理で本質を見抜く冷静な分析家',
    description: 'あなたは内向的で協調型のタイプ。情報を深く分析し、データに基づいた判断ができます。冷静で客観的な視点を持ち、本質的な問題を発見する力があります。',
    personalityTags: ['内向的', '協調型', '分析的', '論理的'],
    strengths: ['深く分析する', 'データ重視', '客観的な視点'],
    growthAreas: ['直感的な判断', '素早い決断'],
    radarScores: [70, 95, 75, 80, 85, 80],
    bgGradient: 'from-purple-50 to-purple-100',
    icon: OwlIcon,
  },
  cheetah: {
    name: 'チーター型チャレンジャー',
    catchphrase: 'スピードと瞬発力で誰よりも早く動く行動派',
    description: 'あなたは外向的で主導型のタイプ。スピード感を持って行動し、新しい挑戦を恐れません。瞬発力があり、機会を逃さずに行動できます。変化を楽しみながら、常に前進し続けます。',
    personalityTags: ['外向的', '主導型', '行動力', 'スピード'],
    strengths: ['スピード感がある', '挑戦を恐れない', '瞬発力がある'],
    growthAreas: ['計画性', '慎重さ'],
    radarScores: [85, 75, 80, 95, 90, 85],
    bgGradient: 'from-yellow-50 to-yellow-100',
    icon: CheetahIcon,
  },
  elephant: {
    name: 'ゾウ型サポーター',
    catchphrase: '安定感と包容力で周囲を支える縁の下の力持ち',
    description: 'あなたは内向的で協調型のタイプ。安定感があり、周囲の人々を支えるのが得意です。包容力があり、チームメンバーの成長を支援します。継続的なサポートで、組織全体の成果を高められます。',
    personalityTags: ['内向的', '協調型', '安定性', '支援力'],
    strengths: ['安定感がある', '周囲を支える', '包容力がある'],
    growthAreas: ['主導する力', '自己主張'],
    radarScores: [85, 70, 90, 75, 85, 75],
    bgGradient: 'from-pink-50 to-pink-100',
    icon: ElephantIcon,
  },
  shark: {
    name: 'サメ型イノベーター',
    catchphrase: '常に前進し新しい価値を生み出す革新者',
    description: 'あなたは外向的で主導型のタイプ。常に前進し、新しいアイデアや価値を生み出すのが得意です。現状に満足せず、常に改善や革新を求めます。イノベーションを起こし、組織を変革できます。',
    personalityTags: ['外向的', '主導型', '革新性', '創造力'],
    strengths: ['革新的なアイデア', '常に前進', '変革を起こす'],
    growthAreas: ['現状の評価', '安定性の重視'],
    radarScores: [85, 80, 75, 90, 85, 95],
    bgGradient: 'from-cyan-50 to-cyan-100',
    icon: SharkIcon,
  },
  bee: {
    name: 'ミツバチ型オーガナイザー',
    catchphrase: '緻密な計画と実行力で物事を整える組織の要',
    description: 'あなたは内向的で協調型のタイプ。物事を体系的に整理し、効率的なプロセスを構築するのが得意です。計画性が高く、細部まで気を配りながら実行できます。組織を支える重要な役割を担えます。',
    personalityTags: ['内向的', '協調型', '計画性', '実行力'],
    strengths: ['計画性が高い', '効率的に整理', '細部に気を配る'],
    growthAreas: ['柔軟な対応', '大胆な挑戦'],
    radarScores: [75, 85, 80, 80, 85, 75],
    bgGradient: 'from-amber-50 to-amber-100',
    icon: BeeIcon,
  },
  parrot: {
    name: 'インコ型クリエイター',
    catchphrase: '自由な発想とカラフルなアイデアで新しい風を吹かせる',
    description: 'あなたは外向的で協調型のタイプ。自由な発想を持ち、創造的なアイデアを生み出すのが得意です。カラフルで独創的な視点で、新しい価値を創造できます。表現力が豊かで、クリエイティブな仕事に向いています。',
    personalityTags: ['外向的', '協調型', '創造性', '表現力'],
    strengths: ['創造的なアイデア', '表現力が豊か', '自由な発想'],
    growthAreas: ['現実的な思考', '計画的な実行'],
    radarScores: [90, 75, 85, 85, 80, 85],
    bgGradient: 'from-emerald-50 to-emerald-100',
    icon: ParrotIcon,
  },
  octopus: {
    name: 'タコ型エキスパート',
    catchphrase: '多彩なスキルで複雑な課題も器用にこなすマルチプレイヤー',
    description: 'あなたは内向的で主導型のタイプ。複数のスキルを持ち、様々な課題に対応できるマルチプレイヤーです。器用で柔軟性があり、複雑な状況でも適切に処理できます。専門性の深さと幅広さを兼ね備えています。',
    personalityTags: ['内向的', '主導型', '専門性', '柔軟性'],
    strengths: ['マルチスキル', '柔軟に対応', '複雑な課題に強い'],
    growthAreas: ['専門性の深化', 'チームとの連携'],
    radarScores: [80, 90, 80, 85, 85, 90],
    bgGradient: 'from-rose-50 to-rose-100',
    icon: OctopusIcon,
  },
}

const EVALUATION_AXES = ['コミュニケーション', '論理的思考', 'カルチャーフィット', '仕事への意欲', '課題対応力', '成長可能性']
const EVALUATION_AXES_SHORT = ['コミュ力', '論理思考', '文化適性', '意欲', '課題力', '成長性']

// 性格タグバッジのスタイルマッピング
const TAG_STYLES: Record<string, string> = {
  外向的: 'bg-orange-100 text-orange-700',
  内向的: 'bg-orange-100 text-orange-700',
  主導型: 'bg-blue-100 text-blue-700',
  協調型: 'bg-blue-100 text-blue-700',
  決断力: 'bg-green-100 text-green-700',
  信頼性: 'bg-green-100 text-green-700',
  行動派: 'bg-purple-100 text-purple-700',
  コミュニケーション: 'bg-purple-100 text-purple-700',
  分析的: 'bg-purple-100 text-purple-700',
  戦略的: 'bg-green-100 text-green-700',
  共感力: 'bg-green-100 text-green-700',
  ビジョン力: 'bg-purple-100 text-purple-700',
  先見性: 'bg-green-100 text-green-700',
  チームワーク: 'bg-purple-100 text-purple-700',
  論理的: 'bg-purple-100 text-purple-700',
  行動力: 'bg-purple-100 text-purple-700',
  スピード: 'bg-green-100 text-green-700',
  安定性: 'bg-green-100 text-green-700',
  支援力: 'bg-purple-100 text-purple-700',
  革新性: 'bg-purple-100 text-purple-700',
  創造力: 'bg-green-100 text-green-700',
  計画性: 'bg-green-100 text-green-700',
  実行力: 'bg-purple-100 text-purple-700',
  創造性: 'bg-purple-100 text-purple-700',
  表現力: 'bg-green-100 text-green-700',
  専門性: 'bg-green-100 text-green-700',
  柔軟性: 'bg-purple-100 text-purple-700',
}

// TODO: Phase 4 - OGP画像生成・シェアURL生成
export default function DiagnosisPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const [toast, setToast] = useState('')

  // ダミーで「ライオン型リーダー」タイプを表示
  const currentType = PERSONALITY_TYPES.lion
  const currentTypeKey = 'lion'
  const IconComponent = currentType.icon

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  // レーダーチャート用の計算
  const cx = 80
  const cy = 80
  const maxR = 50
  const labelR = 70
  const getPoint = (i: number, r: number) => {
    const angle = (-90 + i * 60) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const dataPoints = currentType.radarScores.map((score, i) => getPoint(i, (score / 100) * maxR))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <>
      {/* 戻るボタン */}
      <button
        onClick={() => router.back()}
        className="fixed top-4 left-4 z-50 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-gray-700 text-sm font-medium hover:bg-white transition-all"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>戻る</span>
      </button>

      {/* モバイル表示 */}
      <div className={`md:hidden min-h-screen overflow-y-auto bg-gradient-to-br ${currentType.bgGradient}`}>
        <div className="max-w-[430px] mx-auto flex flex-col items-center px-4 py-4 gap-3">
          {/* タイトル */}
          <h1 className="text-base font-bold text-[#333] text-center">あなたの仕事キャラは？</h1>

          {/* 動物キャラSVG */}
          <div>
            <IconComponent className="w-[120px] h-[120px]" />
          </div>

          {/* タイプ名 */}
          <h2 className="text-xl font-bold text-[#333] text-center">{currentType.name}！</h2>

          {/* キャッチコピー */}
          <p className="text-sm font-medium text-[#333] text-center">{currentType.catchphrase}</p>

          {/* 性格タグバッジ */}
          <div className="flex flex-wrap justify-center gap-2">
            {currentType.personalityTags.map((tag, index) => (
              <span key={index} className={`inline-flex px-3 py-1 ${TAG_STYLES[tag] || 'bg-slate-100 text-slate-700'} text-xs font-medium rounded-full shadow-sm`}>
                {tag}
              </span>
            ))}
          </div>

          {/* 性格分析テキスト */}
          <p className="text-sm font-medium text-[#333] text-center leading-relaxed">{currentType.description}</p>

          {/* 強みと伸びしろ（文章形式） */}
          <div className="w-full bg-white/70 rounded-xl p-4 border border-white shadow-sm">
            <p className="text-sm font-medium text-[#333] text-center leading-relaxed">
              {currentType.analysisText || 'あなたの強みは、決断力とチームを動かす推進力。困難な場面でもプレッシャーを力に変えて前に進めるタイプです。一方で、周囲の声にもう少し耳を傾けると、さらに信頼されるリーダーになれるかも。あなたのリーダーシップは、周りの人にとって心強い存在です！'}
            </p>
          </div>

          {/* レーダーチャート */}
          <div>
            <svg viewBox="0 0 160 160" className="w-40 h-40">
              <defs>
                <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFD89B" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#FFA500" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#FFD89B" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              {/* グリッド */}
              {[1, 2, 3, 4, 5].map((l) => {
                const r = (l / 5) * maxR
                const pts = [0, 1, 2, 3, 4, 5].map((i) => getPoint(i, r))
                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                return <path key={l} d={path} fill="none" stroke="#D1D5DB" strokeWidth="1" />
              })}
              {/* 軸線 */}
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const p = getPoint(i, maxR)
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#D1D5DB" strokeWidth="1" />
              })}
              {/* データエリア */}
              <path d={dataPath} fill="url(#radarGrad)" stroke="#FF8C42" strokeWidth="2.5" />
              {/* データポイント */}
              {dataPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill="#FF8C42" />
              ))}
              {/* 軸ラベルとスコア */}
              {EVALUATION_AXES_SHORT.map((axis, i) => {
                const p = getPoint(i, labelR)
                return (
                  <g key={i}>
                    <text x={p.x} y={p.y} textAnchor="middle" fill="#333" fontSize="9" fontWeight="500">
                      {axis}
                    </text>
                    <text x={p.x} y={p.y + 10} textAnchor="middle" fill="#333" fontSize="9" fontWeight="bold">
                      {currentType.radarScores[i]}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Powered by */}
          <p className="text-xs text-gray-400 text-center mt-2">Powered by AI人事24h</p>
        </div>

        {/* 12タイプ一覧グリッド（モバイル） */}
        <div className="max-w-[430px] mx-auto px-4 py-6 pb-12 bg-white">
          <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-slate-200">
            <h3 className="text-lg font-bold text-[#333] mb-4 text-center">全12タイプ</h3>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(PERSONALITY_TYPES).map(([key, type]) => {
                const TypeIcon = type.icon
                const isCurrent = key === currentTypeKey
                return (
                  <div
                    key={key}
                    className={`p-2 rounded-xl text-center transition-all ${
                      isCurrent
                        ? `bg-gradient-to-br ${type.bgGradient} border-2 border-slate-900 shadow-lg`
                        : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <TypeIcon className={`w-8 h-8 mx-auto mb-1 ${isCurrent ? '' : 'opacity-60'}`} />
                    <p className={`text-xs font-semibold ${isCurrent ? 'text-[#333]' : 'text-slate-600'}`}>{type.name}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* PC表示 */}
      <div className="hidden md:block min-h-screen bg-slate-100 py-8">
        <div className="max-w-[430px] mx-auto">
          {/* カード */}
          <div className={`rounded-3xl bg-gradient-to-br ${currentType.bgGradient} p-6 shadow-xl border-4 border-white mb-8`}>
            {/* タイトル */}
            <h1 className="text-base font-bold text-[#333] mb-3 text-center">あなたの仕事キャラは？</h1>

            {/* 動物キャラSVG */}
            <div className="flex justify-center mb-3">
              <IconComponent className="w-[120px] h-[120px]" />
            </div>

            {/* タイプ名 */}
            <h2 className="text-xl font-bold text-[#333] mb-2 text-center">{currentType.name}！</h2>

            {/* キャッチコピー */}
            <p className="text-sm font-medium text-[#333] mb-3 text-center">{currentType.catchphrase}</p>

            {/* 性格タグバッジ */}
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {currentType.personalityTags.map((tag, index) => (
                <span key={index} className={`inline-flex px-3 py-1 ${TAG_STYLES[tag] || 'bg-slate-100 text-slate-700'} text-xs font-medium rounded-full shadow-sm`}>
                  {tag}
                </span>
              ))}
            </div>

            {/* 性格分析テキスト */}
            <p className="text-sm font-medium text-[#333] text-center mb-4 leading-relaxed">{currentType.description}</p>

            {/* 強みと伸びしろ（文章形式） */}
            <div className="bg-white/70 rounded-xl p-4 border border-white shadow-sm mb-4">
              <p className="text-sm font-medium text-[#333] text-center leading-relaxed">
                {currentType.analysisText || 'あなたの強みは、決断力とチームを動かす推進力。困難な場面でもプレッシャーを力に変えて前に進めるタイプです。一方で、周囲の声にもう少し耳を傾けると、さらに信頼されるリーダーになれるかも。あなたのリーダーシップは、周りの人にとって心強い存在です！'}
              </p>
            </div>

            {/* レーダーチャート */}
            <div className="flex justify-center mb-4">
              <svg viewBox="0 0 160 160" className="w-40 h-40">
                <defs>
                  <linearGradient id="radarGradPC" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFD89B" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#FFA500" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#FFD89B" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                {/* グリッド */}
                {[1, 2, 3, 4, 5].map((l) => {
                  const r = (l / 5) * maxR
                  const pts = [0, 1, 2, 3, 4, 5].map((i) => getPoint(i, r))
                  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                  return <path key={l} d={path} fill="none" stroke="#D1D5DB" strokeWidth="1" />
                })}
                {/* 軸線 */}
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const p = getPoint(i, maxR)
                  return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#D1D5DB" strokeWidth="1" />
                })}
                {/* データエリア */}
                <path d={dataPath} fill="url(#radarGradPC)" stroke="#FF8C42" strokeWidth="2.5" />
                {/* データポイント */}
                {dataPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="#FF8C42" />
                ))}
                {/* 軸ラベルとスコア */}
                {EVALUATION_AXES_SHORT.map((axis, i) => {
                  const p = getPoint(i, labelR)
                  return (
                    <g key={i}>
                      <text x={p.x} y={p.y} textAnchor="middle" fill="#333" fontSize="9" fontWeight="500">
                        {axis}
                      </text>
                      <text x={p.x} y={p.y + 10} textAnchor="middle" fill="#333" fontSize="9" fontWeight="bold">
                        {currentType.radarScores[i]}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Powered by */}
            <p className="text-xs text-gray-400 text-center mt-2">Powered by AI人事24h</p>
          </div>

          {/* 12タイプ一覧グリッド */}
          <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-slate-200 mb-8">
            <h3 className="text-xl font-bold text-[#333] mb-4 text-center">全12タイプ</h3>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(PERSONALITY_TYPES).map(([key, type]) => {
                const TypeIcon = type.icon
                const isCurrent = key === currentTypeKey
                return (
                  <div
                    key={key}
                    className={`p-3 rounded-xl text-center transition-all ${
                      isCurrent
                        ? `bg-gradient-to-br ${type.bgGradient} border-2 border-slate-900 shadow-lg`
                        : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <TypeIcon className={`w-10 h-10 mx-auto mb-1 ${isCurrent ? '' : 'opacity-60'}`} />
                    <p className={`text-xs font-semibold ${isCurrent ? 'text-[#333]' : 'text-slate-600'}`}>{type.name}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 border-2 border-white">
          {toast}
        </div>
      )}
    </>
  )
}
