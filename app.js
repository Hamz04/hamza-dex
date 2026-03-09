import React from 'react';
import { createRoot } from 'react-dom/client';
import { createElement as h, useState, useEffect, useCallback } from 'react';

// ===== CONTRACTS CONFIG =====
const ADDRESSES = {
  FACTORY: '0x287a3a66474a98A2B5BaAeBDDb3AdBFA78629017',
  ROUTER: '0x65450C8ED5ecC476eaf83D56EcbFC812182E9bdF',
  WETH: '0x59B5Ea637220288e212A65FCb0e781963924Ac32',
  FLUX: '0x0b45216ce0a5DF6E4F7809cDFB693B1a41415720',
  ARC: '0xB8Ea56ec6FfbDCeE9036F5fC11fc99436078A19A',
  POOL_FLUX_ARC: '0x9Ef2e813Fb4F91626bde42B0560335911F6CD92e',
};

const TOKENS = [
  { symbol: 'FLUX', name: 'FluxCoin', address: ADDRESSES.FLUX, decimals: 18 },
  { symbol: 'ARC', name: 'ArcToken', address: ADDRESSES.ARC, decimals: 18 },
  { symbol: 'WETH', name: 'Wrapped Ether', address: ADDRESSES.WETH, decimals: 18 },
];

const ERC20_ABI = [
  {type:'function',name:'balanceOf',inputs:[{name:'',type:'address'}],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'allowance',inputs:[{name:'',type:'address'},{name:'',type:'address'}],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'approve',inputs:[{name:'',type:'address'},{name:'',type:'uint256'}],outputs:[{name:'',type:'bool'}],stateMutability:'nonpayable'},
  {type:'function',name:'totalSupply',inputs:[],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
];

const ROUTER_ABI = [
  {type:'function',name:'swapExactTokensForTokens',inputs:[{name:'amountIn',type:'uint256'},{name:'amountOutMin',type:'uint256'},{name:'path',type:'address[]'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}],outputs:[{name:'',type:'uint256[]'}],stateMutability:'nonpayable'},
  {type:'function',name:'getAmountsOut',inputs:[{name:'amountIn',type:'uint256'},{name:'path',type:'address[]'}],outputs:[{name:'',type:'uint256[]'}],stateMutability:'view'},
  {type:'function',name:'addLiquidity',inputs:[{name:'tokenA',type:'address'},{name:'tokenB',type:'address'},{name:'amountADesired',type:'uint256'},{name:'amountBDesired',type:'uint256'},{name:'amountAMin',type:'uint256'},{name:'amountBMin',type:'uint256'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}],outputs:[{name:'amountA',type:'uint256'},{name:'amountB',type:'uint256'},{name:'liquidity',type:'uint256'}],stateMutability:'nonpayable'},
  {type:'function',name:'removeLiquidity',inputs:[{name:'tokenA',type:'address'},{name:'tokenB',type:'address'},{name:'liquidity',type:'uint256'},{name:'amountAMin',type:'uint256'},{name:'amountBMin',type:'uint256'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}],outputs:[{name:'amountA',type:'uint256'},{name:'amountB',type:'uint256'}],stateMutability:'nonpayable'},
];

const POOL_ABI = [
  {type:'function',name:'token0',inputs:[],outputs:[{name:'',type:'address'}],stateMutability:'view'},
  {type:'function',name:'token1',inputs:[],outputs:[{name:'',type:'address'}],stateMutability:'view'},
  {type:'function',name:'getReserves',inputs:[],outputs:[{name:'',type:'uint112'},{name:'',type:'uint112'},{name:'',type:'uint32'}],stateMutability:'view'},
  {type:'function',name:'totalSupply',inputs:[],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'balanceOf',inputs:[{name:'',type:'address'}],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'approve',inputs:[{name:'',type:'address'},{name:'',type:'uint256'}],outputs:[{name:'',type:'bool'}],stateMutability:'nonpayable'},
  {type:'function',name:'allowance',inputs:[{name:'',type:'address'},{name:'',type:'address'}],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
];

const FACTORY_ABI = [
  {type:'function',name:'getPool',inputs:[{name:'',type:'address'},{name:'',type:'address'}],outputs:[{name:'',type:'address'}],stateMutability:'view'},
  {type:'function',name:'allPoolsLength',inputs:[],outputs:[{name:'',type:'uint256'}],stateMutability:'view'},
];

const ETH = 'https://sepolia.etherscan.io/address/';
const SEPOLIA_ID = 11155111;
const SEPOLIA_RPC = 'https://rpc.sepolia.org';

// ===== VIEM HELPERS =====
let publicClient = null;
let walletClient = null;
let userAddress = null;

async function initClients() {
  const { createPublicClient, http } = await import('viem');
  const { sepolia } = await import('https://esm.sh/viem@2.21.54/chains');
  publicClient = createPublicClient({ chain: sepolia, transport: http() });
}

async function connectWallet() {
  if (!window.ethereum) { alert('Please install MetaMask!'); return null; }
  const { createWalletClient, custom } = await import('viem');
  const { sepolia } = await import('https://esm.sh/viem@2.21.54/chains');
  const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(chainId,16) !== SEPOLIA_ID) {
    try { await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]}); }
    catch(e) { alert('Please switch to Sepolia network'); return null; }
  }
  walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum), account: addr });
  userAddress = addr;
  return addr;
}

async function readContract(address, abi, functionName, args=[]) {
  if (!publicClient) await initClients();
  return publicClient.readContract({ address, abi, functionName, args });
}

async function writeContract(address, abi, functionName, args=[]) {
  if (!walletClient) throw new Error('Wallet not connected');
  const hash = await walletClient.writeContract({ address, abi, functionName, args });
  if (!publicClient) await initClients();
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

function formatUnits(val, decimals=18) {
  if (val === undefined || val === null) return '0';
  const s = val.toString().padStart(decimals+1,'0');
  const whole = s.slice(0, s.length-decimals) || '0';
  const frac = s.slice(s.length-decimals);
  return `${whole}.${frac}`;
}

function parseUnits(val, decimals=18) {
  const [whole='0', frac=''] = val.split('.');
  const paddedFrac = (frac+'0'.repeat(decimals)).slice(0,decimals);
  return BigInt(whole+paddedFrac);
}

const MAX_UINT256 = 2n**256n - 1n;

// ===== REACT COMPONENTS =====

function ConnectButton({ address, onConnect, onDisconnect, chainId }) {
  if (address) {
    return h('div',{style:{display:'flex',alignItems:'center',gap:'12px'}},
      h('span',{style:{fontSize:'12px',padding:'4px 10px',borderRadius:'9999px',fontWeight:500,
        backgroundColor:chainId===SEPOLIA_ID?'rgba(139,92,246,0.15)':'rgba(239,68,68,0.15)',
        color:chainId===SEPOLIA_ID?'#8b5cf6':'#ef4444',
        border:`1px solid ${chainId===SEPOLIA_ID?'rgba(139,92,246,0.3)':'rgba(239,68,68,0.3)'}`}},
        chainId===SEPOLIA_ID?'Sepolia':'Wrong Network'),
      h('button',{onClick:onDisconnect,style:{display:'flex',alignItems:'center',gap:'8px',padding:'8px 16px',borderRadius:'12px',fontSize:'14px',fontWeight:500,backgroundColor:'#1a1b23',border:'1px solid #2a2b35',color:'#f1f5f9',cursor:'pointer'}},
        h('span',{style:{width:'8px',height:'8px',borderRadius:'50%',backgroundColor:'#22c55e',display:'inline-block'}}),
        `${address.slice(0,6)}...${address.slice(-4)}`)
    );
  }
  return h('button',{onClick:onConnect,className:'btn-gradient',style:{padding:'10px 20px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Connect Wallet');
}

function SwapPanel({ address }) {
  const [tokenIn, setTokenIn] = useState(TOKENS[0]);
  const [tokenOut, setTokenOut] = useState(TOKENS[1]);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [txStatus, setTxStatus] = useState('');
  const [balIn, setBalIn] = useState(null);
  const [balOut, setBalOut] = useState(null);
  const [needsApproval, setNeedsApproval] = useState(false);

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const [bi, bo] = await Promise.all([
        readContract(tokenIn.address, ERC20_ABI, 'balanceOf', [address]),
        readContract(tokenOut.address, ERC20_ABI, 'balanceOf', [address])
      ]);
      setBalIn(bi); setBalOut(bo);
    } catch(e) {}
  }, [address, tokenIn, tokenOut]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) { setAmountOut(''); return; }
    const fetchQuote = async () => {
      try {
        const amounts = await readContract(ADDRESSES.ROUTER, ROUTER_ABI, 'getAmountsOut', [parseUnits(amountIn, 18), [tokenIn.address, tokenOut.address]]);
        setAmountOut(formatUnits(amounts[1], 18));
      } catch(e) { setAmountOut(''); }
    };
    const t = setTimeout(fetchQuote, 300);
    return () => clearTimeout(t);
  }, [amountIn, tokenIn, tokenOut]);

  useEffect(() => {
    if (!address || !amountIn || parseFloat(amountIn) <= 0) { setNeedsApproval(false); return; }
    readContract(tokenIn.address, ERC20_ABI, 'allowance', [address, ADDRESSES.ROUTER])
      .then(a => setNeedsApproval(a < parseUnits(amountIn, 18)))
      .catch(() => {});
  }, [address, tokenIn, amountIn]);

  const handleSwitch = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmountIn(amountOut); setAmountOut(amountIn); };
  const handleApprove = async () => {
    setTxStatus('Approving...');
    try { await writeContract(tokenIn.address, ERC20_ABI, 'approve', [ADDRESSES.ROUTER, MAX_UINT256]); setTxStatus('Approved!'); setNeedsApproval(false); }
    catch(e) { setTxStatus('Approval failed'); } setTimeout(()=>setTxStatus(''),3000);
  };
  const handleSwap = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) return;
    const minOut = parseUnits((parseFloat(amountOut)*(1-slippage/100)).toFixed(18), 18);
    const deadline = BigInt(Math.floor(Date.now()/1000)+1200);
    setTxStatus('Swapping...');
    try { await writeContract(ADDRESSES.ROUTER, ROUTER_ABI, 'swapExactTokensForTokens', [parseUnits(amountIn,18), minOut, [tokenIn.address,tokenOut.address], address, deadline]); setTxStatus('Swap successful!'); setAmountIn(''); setAmountOut(''); refreshBalances(); }
    catch(e) { setTxStatus('Swap failed'); } setTimeout(()=>setTxStatus(''),3000);
  };

  const cs = {backgroundColor:'#1a1b23',border:'1px solid #2a2b35',borderRadius:'16px',padding:'20px'};
  const ib = {backgroundColor:'#12131a',border:'1px solid #2a2b35',borderRadius:'12px',padding:'12px',display:'flex',alignItems:'center',gap:'12px'};
  const is = {flex:1,backgroundColor:'transparent',color:'#f1f5f9',fontSize:'18px',textAlign:'right',border:'none',outline:'none',fontFamily:'JetBrains Mono,monospace'};
  const ls = {fontSize:'12px',fontWeight:500,color:'#64748b',marginBottom:'6px'};
  const bs = {fontSize:'12px',color:'#64748b',fontFamily:'JetBrains Mono,monospace'};

  return h('div',{style:{maxWidth:'448px',margin:'0 auto'}},
    h('div',{style:cs,className:'card-glow'},
      h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}},
        h('h2',{style:{fontSize:'18px',fontWeight:700,color:'#f1f5f9'}},'Swap'),
        h('div',{style:{display:'flex',gap:'4px'}},
          [0.5,1,2].map(s=>h('button',{key:s,onClick:()=>setSlippage(s),style:{fontSize:'11px',padding:'4px 10px',borderRadius:'8px',fontWeight:500,border:'none',cursor:'pointer',backgroundColor:slippage===s?'#3b82f6':'#22232d',color:slippage===s?'#fff':'#94a3b8'}},s+'%')))),
      h('div',null,
        h('div',{style:{display:'flex',justifyContent:'space-between'}},h('span',{style:ls},'From'),address&&balIn!==null&&h('span',{style:bs},'Bal: '+parseFloat(formatUnits(balIn,18)).toFixed(4))),
        h('div',{style:ib},
          h('select',{value:tokenIn.symbol,onChange:e=>{const t=TOKENS.find(x=>x.symbol===e.target.value);if(t&&t.address!==tokenOut.address)setTokenIn(t)},style:{backgroundColor:'transparent',color:'#f1f5f9',fontSize:'14px',fontWeight:600,border:'none',outline:'none',cursor:'pointer'}},
            TOKENS.map(t=>h('option',{key:t.symbol,value:t.symbol,style:{backgroundColor:'#1a1b23'}},t.symbol))),
          h('input',{type:'number',placeholder:'0.0',value:amountIn,onChange:e=>setAmountIn(e.target.value),style:is}))),
      h('div',{style:{display:'flex',justifyContent:'center',margin:'-8px 0',position:'relative',zIndex:10}},
        h('button',{onClick:handleSwitch,style:{width:'36px',height:'36px',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'#22232d',border:'1px solid #2a2b35',color:'#94a3b8',cursor:'pointer',fontSize:'16px'}},'\u21C5')),
      h('div',null,
        h('div',{style:{display:'flex',justifyContent:'space-between'}},h('span',{style:ls},'To'),address&&balOut!==null&&h('span',{style:bs},'Bal: '+parseFloat(formatUnits(balOut,18)).toFixed(4))),
        h('div',{style:ib},
          h('select',{value:tokenOut.symbol,onChange:e=>{const t=TOKENS.find(x=>x.symbol===e.target.value);if(t&&t.address!==tokenIn.address)setTokenOut(t)},style:{backgroundColor:'transparent',color:'#f1f5f9',fontSize:'14px',fontWeight:600,border:'none',outline:'none',cursor:'pointer'}},
            TOKENS.map(t=>h('option',{key:t.symbol,value:t.symbol,style:{backgroundColor:'#1a1b23'}},t.symbol))),
          h('input',{type:'number',placeholder:'0.0',value:amountOut,readOnly:true,style:{...is,color:'#94a3b8'}}))),
      amountIn&&amountOut&&parseFloat(amountOut)>0&&h('div',{style:{marginTop:'12px',padding:'12px',borderRadius:'12px',backgroundColor:'#12131a',border:'1px solid #2a2b35'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'12px'}},h('span',{style:{color:'#64748b'}},'Rate'),h('span',{style:{color:'#94a3b8',fontFamily:'JetBrains Mono,monospace'}},'1 '+tokenIn.symbol+' = '+(parseFloat(amountOut)/parseFloat(amountIn)).toFixed(6)+' '+tokenOut.symbol)),
        h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'12px',marginTop:'4px'}},h('span',{style:{color:'#64748b'}},'Min. received'),h('span',{style:{color:'#94a3b8',fontFamily:'JetBrains Mono,monospace'}},(parseFloat(amountOut)*(1-slippage/100)).toFixed(6)+' '+tokenOut.symbol))),
      h('div',{style:{marginTop:'16px'}},
        !address?h('button',{style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600,backgroundColor:'#22232d',color:'#64748b',border:'none',cursor:'not-allowed'}},'Connect Wallet to Swap')
        :needsApproval?h('button',{onClick:handleApprove,className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Approve '+tokenIn.symbol)
        :h('button',{onClick:handleSwap,disabled:!amountIn||parseFloat(amountIn)<=0||!amountOut,className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Swap')),
      txStatus&&h('div',{style:{marginTop:'12px',textAlign:'center',fontSize:'12px',padding:'8px',borderRadius:'8px',backgroundColor:txStatus.includes('successful')?'rgba(34,197,94,0.1)':txStatus.includes('failed')?'rgba(239,68,68,0.1)':'rgba(59,130,246,0.1)',color:txStatus.includes('successful')?'#22c55e':txStatus.includes('failed')?'#ef4444':'#3b82f6'}},txStatus)));
}

function PoolInfo() {
  const [reserves, setReserves] = useState(null);
  const [token0, setToken0] = useState(null);
  const [lpTotal, setLpTotal] = useState(null);
  const [poolCount, setPoolCount] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [r, t0, lp, pc] = await Promise.all([
          readContract(ADDRESSES.POOL_FLUX_ARC, POOL_ABI, 'getReserves'),
          readContract(ADDRESSES.POOL_FLUX_ARC, POOL_ABI, 'token0'),
          readContract(ADDRESSES.POOL_FLUX_ARC, POOL_ABI, 'totalSupply'),
          readContract(ADDRESSES.FACTORY, FACTORY_ABI, 'allPoolsLength'),
        ]);
        setReserves(r); setToken0(t0); setLpTotal(lp); setPoolCount(pc);
      } catch(e) { console.error(e); }
    };
    fetch();
    const iv = setInterval(fetch, 15000);
    return () => clearInterval(iv);
  }, []);

  const isFluxToken0 = token0 && token0.toLowerCase() === ADDRESSES.FLUX.toLowerCase();
  const r0 = reserves ? parseFloat(formatUnits(reserves[0], 18)) : 0;
  const r1 = reserves ? parseFloat(formatUnits(reserves[1], 18)) : 0;
  const fluxR = isFluxToken0 ? r0 : r1;
  const arcR = isFluxToken0 ? r1 : r0;
  const rate = fluxR > 0 ? (arcR / fluxR).toFixed(6) : '...';
  const rateInv = arcR > 0 ? (fluxR / arcR).toFixed(6) : '...';

  const cs = {backgroundColor:'#1a1b23',border:'1px solid #2a2b35',borderRadius:'16px',padding:'20px'};
  const ss = {backgroundColor:'#12131a',border:'1px solid #2a2b35',borderRadius:'12px',padding:'16px'};
  const contracts = [
    {label:'FluxFactory',addr:ADDRESSES.FACTORY},{label:'FluxSwapRouter',addr:ADDRESSES.ROUTER},
    {label:'FLUX/ARC Pool',addr:ADDRESSES.POOL_FLUX_ARC},{label:'WETH9',addr:ADDRESSES.WETH},
    {label:'FluxCoin (FLUX)',addr:ADDRESSES.FLUX},{label:'ArcToken (ARC)',addr:ADDRESSES.ARC}
  ];

  return h('div',{style:{maxWidth:'600px',margin:'0 auto'}},
    h('div',{style:cs,className:'card-glow'},
      h('h2',{style:{fontSize:'18px',fontWeight:700,color:'#f1f5f9',marginBottom:'4px'}},'FLUX / ARC Pool'),
      h('p',{style:{fontSize:'12px',color:'#64748b',marginBottom:'20px'}},'Live on Sepolia Testnet'),
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'20px'}},
        h('div',{style:ss},h('div',{style:{fontSize:'11px',color:'#64748b',marginBottom:'4px'}},'FLUX Reserve'),h('div',{style:{fontSize:'18px',fontWeight:700,color:'#f1f5f9',fontFamily:'JetBrains Mono,monospace'}},fluxR.toLocaleString(undefined,{maximumFractionDigits:2}))),
        h('div',{style:ss},h('div',{style:{fontSize:'11px',color:'#64748b',marginBottom:'4px'}},'ARC Reserve'),h('div',{style:{fontSize:'18px',fontWeight:700,color:'#f1f5f9',fontFamily:'JetBrains Mono,monospace'}},arcR.toLocaleString(undefined,{maximumFractionDigits:2}))),
        h('div',{style:ss},h('div',{style:{fontSize:'11px',color:'#64748b',marginBottom:'4px'}},'Exchange Rate'),h('div',{style:{fontSize:'14px',fontWeight:600,color:'#f1f5f9',fontFamily:'JetBrains Mono,monospace'}},'1 FLUX = '+rate+' ARC'),h('div',{style:{fontSize:'11px',color:'#94a3b8',fontFamily:'JetBrains Mono,monospace',marginTop:'2px'}},'1 ARC = '+rateInv+' FLUX')),
        h('div',{style:ss},h('div',{style:{fontSize:'11px',color:'#64748b',marginBottom:'4px'}},'LP Token Supply'),h('div',{style:{fontSize:'14px',fontWeight:600,color:'#f1f5f9',fontFamily:'JetBrains Mono,monospace'}},lpTotal?parseFloat(formatUnits(lpTotal,18)).toLocaleString(undefined,{maximumFractionDigits:2}):'...'),h('div',{style:{fontSize:'11px',color:'#94a3b8',marginTop:'2px'}},poolCount?Number(poolCount)+' pool(s) created':'...'))),
      h('h3',{style:{fontSize:'14px',fontWeight:600,color:'#f1f5f9',marginBottom:'12px'}},'Contract Addresses'),
      h('div',{style:{borderRadius:'12px',overflow:'hidden',border:'1px solid #2a2b35'}},
        contracts.map((c,i)=>h('div',{key:c.label,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',backgroundColor:i%2===0?'#12131a':'#15161e',borderBottom:i<contracts.length-1?'1px solid #2a2b35':'none'}},
          h('span',{style:{fontSize:'13px',color:'#94a3b8'}},c.label),
          h('a',{href:ETH+c.addr,target:'_blank',rel:'noopener noreferrer',style:{fontSize:'12px',color:'#3b82f6',fontFamily:'JetBrains Mono,monospace',textDecoration:'none'}},c.addr.slice(0,6)+'...'+c.addr.slice(-4)))))));
}

function LiquidityPanel({ address }) {
  const [mode, setMode] = useState('add');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [txStatus, setTxStatus] = useState('');
  const [balA, setBalA] = useState(null);
  const [balB, setBalB] = useState(null);
  const [lpBalance, setLpBalance] = useState(null);
  const [lpTotal, setLpTotal] = useState(null);
  const [reserves, setReserves] = useState(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [ba,bb,lp,lt,r] = await Promise.all([
        readContract(ADDRESSES.FLUX, ERC20_ABI, 'balanceOf', [address]),
        readContract(ADDRESSES.ARC, ERC20_ABI, 'balanceOf', [address]),
        readContract(ADDRESSES.POOL_FLUX_ARC, POOL_ABI, 'balanceOf', [address]),
        readContract(ADDRESSES.POOL_FLUX_ARC, POOL_ABI, 'totalSupply'),
        readContract(ADDRESSES.POOL_FLUX_ARC, POOL_ABI, 'getReserves'),
      ]);
      setBalA(ba); setBalB(bb); setLpBalance(lp); setLpTotal(lt); setReserves(r);
    } catch(e) {}
  }, [address]);

  useEffect(() => { refresh(); const iv = setInterval(refresh,15000); return ()=>clearInterval(iv); }, [refresh]);

  useEffect(() => {
    if (amountA && parseFloat(amountA)>0 && reserves) {
      const r0=parseFloat(formatUnits(reserves[0],18));
      const r1=parseFloat(formatUnits(reserves[1],18));
      if(r0>0) setAmountB((parseFloat(amountA)*r1/r0).toFixed(6));
    }
  }, [amountA, reserves]);

  const poolShare = lpBalance&&lpTotal&&lpTotal>0n ? (Number(lpBalance)*100/Number(lpTotal)).toFixed(4) : '0';

  const handleApprove = async (token) => {
    setTxStatus('Approving...');
    try { await writeContract(token, ERC20_ABI, 'approve', [ADDRESSES.ROUTER, MAX_UINT256]); setTxStatus('Approved!'); }
    catch(e) { setTxStatus('Approval failed'); } setTimeout(()=>setTxStatus(''),3000);
  };

  const handleAdd = async () => {
    if(!amountA||!amountB) return;
    const aWei=parseUnits(amountA,18), bWei=parseUnits(amountB,18);
    const minA=parseUnits((parseFloat(amountA)*0.95).toFixed(18),18), minB=parseUnits((parseFloat(amountB)*0.95).toFixed(18),18);
    const deadline=BigInt(Math.floor(Date.now()/1000)+1200);
    setTxStatus('Adding liquidity...');
    try { await writeContract(ADDRESSES.ROUTER, ROUTER_ABI, 'addLiquidity', [ADDRESSES.FLUX,ADDRESSES.ARC,aWei,bWei,minA,minB,address,deadline]); setTxStatus('Liquidity added!'); setAmountA(''); setAmountB(''); refresh(); }
    catch(e) { setTxStatus('Failed'); } setTimeout(()=>setTxStatus(''),3000);
  };

  const handleRemove = async () => {
    if(!lpAmount) return;
    const lpWei=parseUnits(lpAmount,18); const deadline=BigInt(Math.floor(Date.now()/1000)+1200);
    setTxStatus('Removing liquidity...');
    try { await writeContract(ADDRESSES.ROUTER, ROUTER_ABI, 'removeLiquidity', [ADDRESSES.FLUX,ADDRESSES.ARC,lpWei,0n,0n,address,deadline]); setTxStatus('Liquidity removed!'); setLpAmount(''); refresh(); }
    catch(e) { setTxStatus('Failed'); } setTimeout(()=>setTxStatus(''),3000);
  };

  const [needsA, setNeedsA] = useState(false);
  const [needsB, setNeedsB] = useState(false);
  const [needsLp, setNeedsLp] = useState(false);

  useEffect(() => {
    if(!address) return;
    const check = async () => {
      try {
        if(amountA&&parseFloat(amountA)>0){ const a=await readContract(ADDRESSES.FLUX,ERC20_ABI,'allowance',[address,ADDRESSES.ROUTER]); setNeedsA(a<parseUnits(amountA,18)); } else setNeedsA(false);
        if(amountB&&parseFloat(amountB)>0){ const b=await readContract(ADDRESSES.ARC,ERC20_ABI,'allowance',[address,ADDRESSES.ROUTER]); setNeedsB(b<parseUnits(amountB,18)); } else setNeedsB(false);
        if(lpAmount&&parseFloat(lpAmount)>0){ const l=await readContract(ADDRESSES.POOL_FLUX_ARC,POOL_ABI,'allowance',[address,ADDRESSES.ROUTER]); setNeedsLp(l<parseUnits(lpAmount,18)); } else setNeedsLp(false);
      } catch(e) {}
    };
    check();
  }, [address, amountA, amountB, lpAmount]);

  const cs = {backgroundColor:'#1a1b23',border:'1px solid #2a2b35',borderRadius:'16px',padding:'20px'};
  const ib = {backgroundColor:'#12131a',border:'1px solid #2a2b35',borderRadius:'12px',padding:'12px',display:'flex',alignItems:'center',gap:'12px'};
  const is = {flex:1,backgroundColor:'transparent',color:'#f1f5f9',fontSize:'18px',textAlign:'right',border:'none',outline:'none',fontFamily:'JetBrains Mono,monospace'};
  const ls = {fontSize:'12px',fontWeight:500,color:'#64748b',marginBottom:'6px'};
  const bs = {fontSize:'12px',color:'#64748b',fontFamily:'JetBrains Mono,monospace'};

  return h('div',{style:{maxWidth:'448px',margin:'0 auto'}},
    h('div',{style:cs,className:'card-glow'},
      h('div',{style:{display:'flex',gap:'8px',marginBottom:'16px'}},
        ['add','remove'].map(m=>h('button',{key:m,onClick:()=>setMode(m),style:{flex:1,padding:'10px',borderRadius:'12px',fontSize:'14px',fontWeight:600,border:'none',cursor:'pointer',backgroundColor:mode===m?'#3b82f6':'#22232d',color:mode===m?'#fff':'#94a3b8'}},m==='add'?'Add Liquidity':'Remove Liquidity'))),
      mode==='add'?h('div',null,
        h('div',{style:{display:'flex',justifyContent:'space-between'}},h('span',{style:ls},'FLUX'),balA!==null&&h('span',{style:bs},'Bal: '+parseFloat(formatUnits(balA,18)).toFixed(4))),
        h('div',{style:ib},h('span',{style:{color:'#f1f5f9',fontWeight:600,fontSize:'14px'}},'FLUX'),h('input',{type:'number',placeholder:'0.0',value:amountA,onChange:e=>setAmountA(e.target.value),style:is})),
        h('div',{style:{textAlign:'center',margin:'8px 0',color:'#64748b',fontSize:'18px'}},'+'),
        h('div',{style:{display:'flex',justifyContent:'space-between'}},h('span',{style:ls},'ARC'),balB!==null&&h('span',{style:bs},'Bal: '+parseFloat(formatUnits(balB,18)).toFixed(4))),
        h('div',{style:ib},h('span',{style:{color:'#f1f5f9',fontWeight:600,fontSize:'14px'}},'ARC'),h('input',{type:'number',placeholder:'0.0',value:amountB,readOnly:true,style:{...is,color:'#94a3b8'}})),
        h('div',{style:{marginTop:'12px',padding:'12px',borderRadius:'12px',backgroundColor:'#12131a',border:'1px solid #2a2b35'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'12px'}},h('span',{style:{color:'#64748b'}},'Your Pool Share'),h('span',{style:{color:'#94a3b8'}},poolShare+'%')),
          reserves&&h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'12px',marginTop:'4px'}},h('span',{style:{color:'#64748b'}},'Pool Ratio'),h('span',{style:{color:'#94a3b8'}},'1 FLUX = '+(parseFloat(formatUnits(reserves[1],18))/parseFloat(formatUnits(reserves[0],18))).toFixed(6)+' ARC'))),
        h('div',{style:{marginTop:'16px'}},
          !address?h('button',{style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600,backgroundColor:'#22232d',color:'#64748b',border:'none'}},'Connect Wallet')
          :needsA?h('button',{onClick:()=>handleApprove(ADDRESSES.FLUX),className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Approve FLUX')
          :needsB?h('button',{onClick:()=>handleApprove(ADDRESSES.ARC),className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Approve ARC')
          :h('button',{onClick:handleAdd,disabled:!amountA||parseFloat(amountA)<=0,className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Add Liquidity')))
      :h('div',null,
        h('div',{style:{display:'flex',justifyContent:'space-between'}},h('span',{style:ls},'LP Tokens'),lpBalance!==null&&h('span',{style:bs},'Bal: '+parseFloat(formatUnits(lpBalance,18)).toFixed(6))),
        h('div',{style:ib},h('span',{style:{color:'#f1f5f9',fontWeight:600,fontSize:'14px'}},'LP'),h('input',{type:'number',placeholder:'0.0',value:lpAmount,onChange:e=>setLpAmount(e.target.value),style:is})),
        lpBalance&&h('button',{onClick:()=>setLpAmount(formatUnits(lpBalance,18)),style:{marginTop:'8px',fontSize:'11px',padding:'4px 10px',borderRadius:'8px',border:'none',cursor:'pointer',backgroundColor:'#22232d',color:'#3b82f6'}},'Max'),
        h('div',{style:{marginTop:'16px'}},
          !address?h('button',{style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600,backgroundColor:'#22232d',color:'#64748b',border:'none'}},'Connect Wallet')
          :needsLp?h('button',{onClick:()=>{setTxStatus('Approving LP...');writeContract(ADDRESSES.POOL_FLUX_ARC,POOL_ABI,'approve',[ADDRESSES.ROUTER,MAX_UINT256]).then(()=>{setTxStatus('Approved!');setNeedsLp(false)}).catch(()=>setTxStatus('Failed'))},className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Approve LP Tokens')
          :h('button',{onClick:handleRemove,disabled:!lpAmount||parseFloat(lpAmount)<=0,className:'btn-gradient',style:{width:'100%',padding:'14px',borderRadius:'12px',fontSize:'14px',fontWeight:600}},'Remove Liquidity'))),
      txStatus&&h('div',{style:{marginTop:'12px',textAlign:'center',fontSize:'12px',padding:'8px',borderRadius:'8px',backgroundColor:txStatus.includes('successful')||txStatus.includes('added')||txStatus.includes('removed')?'rgba(34,197,94,0.1)':txStatus.includes('failed')||txStatus.includes('Failed')?'rgba(239,68,68,0.1)':'rgba(59,130,246,0.1)',color:txStatus.includes('successful')||txStatus.includes('added')||txStatus.includes('removed')?'#22c55e':txStatus.includes('failed')||txStatus.includes('Failed')?'#ef4444':'#3b82f6'}},txStatus)));
}

// ===== MAIN APP =====
function App() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [activeTab, setActiveTab] = useState('swap');

  useEffect(() => { initClients(); }, []);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', accs => setAddress(accs[0] || null));
      window.ethereum.on('chainChanged', id => { setChainId(parseInt(id,16)); window.location.reload(); });
      window.ethereum.request({method:'eth_accounts'}).then(accs => { if(accs[0]) { setAddress(accs[0]); window.ethereum.request({method:'eth_chainId'}).then(id=>setChainId(parseInt(id,16))); connectWallet(); }});
    }
  }, []);

  const handleConnect = async () => { const addr = await connectWallet(); if(addr) { setAddress(addr); setChainId(SEPOLIA_ID); }};
  const handleDisconnect = () => { setAddress(null); userAddress=null; walletClient=null; };

  const TABS = [{id:'swap',label:'Swap'},{id:'liquidity',label:'Liquidity'},{id:'pool',label:'Pool Info'}];

  return h('div',{style:{minHeight:'100vh',backgroundColor:'#0a0b0d'}},
    h('header',{style:{position:'sticky',top:0,zIndex:50,backgroundColor:'rgba(10,11,13,0.85)',backdropFilter:'blur(12px)',borderBottom:'1px solid #2a2b35'}},
      h('div',{style:{maxWidth:'1024px',margin:'0 auto',padding:'0 16px',height:'64px',display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'32px'}},
          h('h1',{className:'gradient-text',style:{fontSize:'20px',fontWeight:700}},'Flux Protocol'),
          h('nav',{style:{display:'flex',gap:'4px'}},
            TABS.map(tab=>h('button',{key:tab.id,onClick:()=>setActiveTab(tab.id),style:{padding:'8px 16px',borderRadius:'8px',fontSize:'14px',fontWeight:500,border:'none',cursor:'pointer',color:activeTab===tab.id?'#f1f5f9':'#64748b',backgroundColor:activeTab===tab.id?'#22232d':'transparent'}},tab.label)))),
        h(ConnectButton,{address,onConnect:handleConnect,onDisconnect:handleDisconnect,chainId}))),
    h('main',{style:{maxWidth:'1024px',margin:'0 auto',padding:'40px 16px'}},
      activeTab==='swap'&&h(SwapPanel,{address}),
      activeTab==='liquidity'&&h(LiquidityPanel,{address}),
      activeTab==='pool'&&h(PoolInfo)),
    h('footer',{style:{textAlign:'center',padding:'24px',borderTop:'1px solid #2a2b35'}},
      h('p',{style:{fontSize:'12px',color:'#64748b'}},'Flux Protocol - Live on Sepolia | ',h('a',{href:'https://github.com/Hamz04/arc-swap',target:'_blank',rel:'noopener noreferrer',style:{color:'#3b82f6',textDecoration:'none'}},'GitHub'))));
}

createRoot(document.getElementById('root')).render(h(App));
