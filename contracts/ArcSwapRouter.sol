// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArcSwapFactory {
    function getPair(address, address) external view returns (address);
    function createPair(address, address) external returns (address);
}

interface IArcSwapPair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function swap(uint256, uint256, address, bytes calldata) external;
    function mint(address) external returns (uint256);
    function burn(address) external returns (uint256, uint256);
    function token0() external view returns (address);
}

interface IERC20Router {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/**
 * @title ArcSwapRouter
 * @dev User-facing router. Handles swaps, add/remove liquidity with slippage protection.
 */
contract ArcSwapRouter {
    address public immutable factory;

    constructor(address _factory) {
        factory = _factory;
    }

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "ArcSwapRouter: EXPIRED");
        _;
    }

    function _getReserves(address tokenA, address tokenB) internal view returns (uint256 reserveA, uint256 reserveB) {
        address pair = IArcSwapFactory(factory).getPair(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = IArcSwapPair(pair).getReserves();
        address token0 = IArcSwapPair(pair).token0();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        require(amountIn > 0, "ArcSwapRouter: INSUFFICIENT_INPUT");
        require(reserveIn > 0 && reserveOut > 0, "ArcSwapRouter: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        require(amountOut > 0, "ArcSwapRouter: INSUFFICIENT_OUTPUT");
        require(reserveIn > 0 && reserveOut > 0, "ArcSwapRouter: INSUFFICIENT_LIQUIDITY");
        return (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i+1]);
            amounts[i+1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
        require(amounts[amounts.length - 1] >= amountOutMin, "ArcSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IERC20Router(path[0]).transferFrom(msg.sender, IArcSwapFactory(factory).getPair(path[0], path[1]), amountIn);
        for (uint256 i = 0; i < path.length - 1; i++) {
            address pair = IArcSwapFactory(factory).getPair(path[i], path[i+1]);
            address _to = i < path.length - 2 ? IArcSwapFactory(factory).getPair(path[i+1], path[i+2]) : to;
            address token0 = IArcSwapPair(pair).token0();
            (uint256 amount0Out, uint256 amount1Out) = path[i] == token0 ? (uint256(0), amounts[i+1]) : (amounts[i+1], uint256(0));
            IArcSwapPair(pair).swap(amount0Out, amount1Out, _to, new bytes(0));
        }
    }

    function addLiquidity(
        address tokenA, address tokenB,
        uint256 amountADesired, uint256 amountBDesired,
        uint256 amountAMin, uint256 amountBMin,
        address to, uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pair = IArcSwapFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) pair = IArcSwapFactory(factory).createPair(tokenA, tokenB);
        (uint256 reserveA, uint256 reserveB) = _getReserves(tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "ArcSwapRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
                require(amountAOptimal >= amountAMin, "ArcSwapRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
        IERC20Router(tokenA).transferFrom(msg.sender, pair, amountA);
        IERC20Router(tokenB).transferFrom(msg.sender, pair, amountB);
        liquidity = IArcSwapPair(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA, address tokenB,
        uint256 liquidity, uint256 amountAMin, uint256 amountBMin,
        address to, uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = IArcSwapFactory(factory).getPair(tokenA, tokenB);
        IERC20Router(pair).transferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IArcSwapPair(pair).burn(to);
        address token0 = IArcSwapPair(pair).token0();
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "ArcSwapRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "ArcSwapRouter: INSUFFICIENT_B_AMOUNT");
    }
}
