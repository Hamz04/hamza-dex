// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IHamzaFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IHamzaPool {
    function tokenA() external view returns (address);
    function tokenB() external view returns (address);
    function getReserves() external view returns (uint256 reserveA, uint256 reserveB);
    function swap(uint256 amountAOut, uint256 amountBOut, address to) external;
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amountA, uint256 amountB);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// ─── Custom Errors ────────────────────────────────────────────────────────────

error HamzaRouter__Expired();
error HamzaRouter__InsufficientOutputAmount();
error HamzaRouter__InsufficientAAmount();
error HamzaRouter__InsufficientBAmount();
error HamzaRouter__InvalidPath();
error HamzaRouter__ExcessiveInputAmount();
error HamzaRouter__ETHTransferFailed();
error HamzaRouter__OnlyWETH();
error HamzaRouter__InsufficientLiquidity();
error HamzaRouter__PairNotFound();

// ─── Events ───────────────────────────────────────────────────────────────────

// (emitted by the pool, declared here for indexer convenience)

/**
 * @title HamzaSwapRouterV2
 * @notice AMM router with full ETH wrapping support and Flashbots-friendly design.
 *         All swap functions apply a 997/1000 (0.3%) fee via the pool's reserve math.
 *         Re-entrancy is guarded on all state-modifying functions.
 */
contract HamzaSwapRouterV2 is ReentrancyGuard {

    // ── Immutables ─────────────────────────────────────────────────────────────
    address public immutable factory;
    address public immutable WETH;

    // ── Modifiers ──────────────────────────────────────────────────────────────
    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert HamzaRouter__Expired();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────
    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    // ── Receive (only WETH unwrap) ─────────────────────────────────────────────
    receive() external payable {
        if (msg.sender != WETH) revert HamzaRouter__OnlyWETH();
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    function _getPair(address tokenA, address tokenB) internal view returns (address pair) {
        pair = IHamzaFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) revert HamzaRouter__PairNotFound();
    }

    function _getReserves(
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB, address pair) {
        pair = _getPair(tokenA, tokenB);
        (uint256 r0, uint256 r1) = IHamzaPool(pair).getReserves();
        address t0 = IHamzaPool(pair).tokenA();
        (reserveA, reserveB) = tokenA == t0 ? (r0, r1) : (r1, r0);
    }

    /**
     * @dev 997/1000 fee: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
     */
    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        if (reserveIn == 0 || reserveOut == 0) revert HamzaRouter__InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @dev Inverse: amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
     */
    function _getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        if (reserveIn == 0 || reserveOut == 0) revert HamzaRouter__InsufficientLiquidity();
        if (amountOut >= reserveOut) revert HamzaRouter__InsufficientLiquidity();
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFrom failed");
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    function _quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amountB) {
        if (amountA == 0) revert HamzaRouter__InsufficientOutputAmount();
        if (reserveA == 0 || reserveB == 0) revert HamzaRouter__InsufficientLiquidity();
        amountB = (amountA * reserveB) / reserveA;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADD LIQUIDITY
    // ══════════════════════════════════════════════════════════════════════════

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB, address pair) {
        pair = IHamzaFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = IHamzaFactory(factory).createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB,) = _getReserves(tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = _quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                if (amountBOptimal < amountBMin) revert HamzaRouter__InsufficientBAmount();
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = _quote(amountBDesired, reserveB, reserveA);
                if (amountAOptimal > amountADesired) revert HamzaRouter__InsufficientAAmount();
                if (amountAOptimal < amountAMin) revert HamzaRouter__InsufficientAAmount();
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pair;
        (amountA, amountB, pair) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IHamzaPool(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) nonReentrant returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        address pair;
        (amountToken, amountETH, pair) = _addLiquidity(
            token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin
        );
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        IWETH(WETH).transfer(pair, amountETH);
        liquidity = IHamzaPool(pair).mint(to);

        // Refund excess ETH
        if (msg.value > amountETH) {
            (bool ok,) = msg.sender.call{value: msg.value - amountETH}("");
            if (!ok) revert HamzaRouter__ETHTransferFailed();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  REMOVE LIQUIDITY
    // ══════════════════════════════════════════════════════════════════════════

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) nonReentrant returns (uint256 amountA, uint256 amountB) {
        address pair = _getPair(tokenA, tokenB);
        IHamzaPool(pair).transferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IHamzaPool(pair).burn(to);
        address t0 = IHamzaPool(pair).tokenA();
        (amountA, amountB) = tokenA == t0 ? (amount0, amount1) : (amount1, amount0);
        if (amountA < amountAMin) revert HamzaRouter__InsufficientAAmount();
        if (amountB < amountBMin) revert HamzaRouter__InsufficientBAmount();
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token, WETH, liquidity, amountTokenMin, amountETHMin, address(this), deadline
        );
        _safeTransfer(token, to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        (bool ok,) = to.call{value: amountETH}("");
        if (!ok) revert HamzaRouter__ETHTransferFailed();
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SWAP — TOKEN → TOKEN
    // ══════════════════════════════════════════════════════════════════════════

    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            address pair = _getPair(input, output);
            address t0 = IHamzaPool(pair).tokenA();
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == t0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? _getPair(output, path[i + 2]) : _to;
            IHamzaPool(pair).swap(amount0Out, amount1Out, to);
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path.length < 2) revert HamzaRouter__InvalidPath();
        amounts = _getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert HamzaRouter__InsufficientOutputAmount();
        _safeTransferFrom(path[0], msg.sender, _getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path.length < 2) revert HamzaRouter__InvalidPath();
        amounts = _getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert HamzaRouter__ExcessiveInputAmount();
        _safeTransferFrom(path[0], msg.sender, _getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SWAP — ETH ↔ TOKEN
    // ══════════════════════════════════════════════════════════════════════════

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path.length < 2 || path[0] != WETH) revert HamzaRouter__InvalidPath();
        amounts = _getAmountsOut(msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert HamzaRouter__InsufficientOutputAmount();
        IWETH(WETH).deposit{value: amounts[0]}();
        IWETH(WETH).transfer(_getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path.length < 2 || path[path.length - 1] != WETH) revert HamzaRouter__InvalidPath();
        amounts = _getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert HamzaRouter__ExcessiveInputAmount();
        _safeTransferFrom(path[0], msg.sender, _getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        (bool ok,) = to.call{value: amounts[amounts.length - 1]}("");
        if (!ok) revert HamzaRouter__ETHTransferFailed();
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path.length < 2 || path[path.length - 1] != WETH) revert HamzaRouter__InvalidPath();
        amounts = _getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert HamzaRouter__InsufficientOutputAmount();
        _safeTransferFrom(path[0], msg.sender, _getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        (bool ok,) = to.call{value: amounts[amounts.length - 1]}("");
        if (!ok) revert HamzaRouter__ETHTransferFailed();
    }

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        if (path.length < 2 || path[0] != WETH) revert HamzaRouter__InvalidPath();
        amounts = _getAmountsIn(amountOut, path);
        if (amounts[0] > msg.value) revert HamzaRouter__ExcessiveInputAmount();
        IWETH(WETH).deposit{value: amounts[0]}();
        IWETH(WETH).transfer(_getPair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
        // Refund excess ETH
        if (msg.value > amounts[0]) {
            (bool ok,) = msg.sender.call{value: msg.value - amounts[0]}("");
            if (!ok) revert HamzaRouter__ETHTransferFailed();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountOut) {
        return _getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountIn) {
        return _getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function _getAmountsOut(uint256 amountIn, address[] memory path) internal view returns (uint256[] memory amounts) {
        if (path.length < 2) revert HamzaRouter__InvalidPath();
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut,) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = _getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function _getAmountsIn(uint256 amountOut, address[] memory path) internal view returns (uint256[] memory amounts) {
        if (path.length < 2) revert HamzaRouter__InvalidPath();
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut,) = _getReserves(path[i - 1], path[i]);
            amounts[i - 1] = _getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory) {
        return _getAmountsOut(amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory) {
        return _getAmountsIn(amountOut, path);
    }
}
